"""
Local Voira v1 inference server (development only).

Loads the Voira v1 LoRA adapter (ekomobng/voira-essay-lora-v1) fused onto
Llama 3.1 8B Instruct using mlx-lm and serves HTTP inference to the main
FastAPI backend (apps/api/main.py).

This server is NOT part of the production deployment. It's a separate
process you run locally on your Mac while developing. In production, the
backend points VOIRA_MODEL_URL at Hugging Face Inference Endpoints or
Replicate instead.

----------------------------------------------------------------------------
ONE-TIME SETUP (run this once, then you never touch it again):
----------------------------------------------------------------------------

1. Install inference dependencies in a separate virtualenv (keeps them
   out of the main backend's deps so they never ship to production):

       python3.11 -m venv .voira-mlx-venv
       source .voira-mlx-venv/bin/activate
       pip install --upgrade pip
       pip install mlx-lm huggingface_hub fastapi uvicorn

2. Fuse the LoRA adapter into the base model (takes ~5 min, ~16GB download):

       python apps/api/inference_server.py --setup

   This:
   - Downloads meta-llama/Meta-Llama-3.1-8B-Instruct (requires HF access;
     run `huggingface-cli login` first with a token that has Llama access)
   - Downloads the Voira LoRA adapter from ekomobng/voira-essay-lora-v1
   - Fuses them into a single MLX model saved to ~/.voira/voira-v1-mlx/
   - Quantizes to 4-bit (~5GB on disk, runs in ~6GB RAM)

3. Configure the backend to point at this server. In apps/api/.env add:

       VOIRA_MODEL_ENABLED=true
       VOIRA_MODEL_URL=http://localhost:8090

----------------------------------------------------------------------------
DAILY USE (to start the inference server):
----------------------------------------------------------------------------

       source .voira-mlx-venv/bin/activate
       python apps/api/inference_server.py

Then in another terminal, run the main backend as usual
(`cd apps/api && uvicorn main:app --reload`). The /analyze endpoint will
now route application essays through the Voira model.

----------------------------------------------------------------------------
ENDPOINTS:
----------------------------------------------------------------------------

    GET  /health        -> {"status": "ok", "model_loaded": bool}
    POST /generate      -> accepts {"outline": str, "max_new_tokens": int,
                                    "temperature": float, "top_p": float,
                                    "repetition_penalty": float}
                           returns {"essay": str, "usage": {...}}
"""

import argparse
import logging
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("voira_inference")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


DEFAULT_FUSED_MODEL_DIR = Path.home() / ".voira" / "voira-v1-mlx"
BASE_MODEL_ID = "meta-llama/Meta-Llama-3.1-8B-Instruct"
ADAPTER_REPO = "ekomobng/voira-essay-lora-v1"

# System prompt used during fine-tuning (must match the training contract).
SYSTEM_PROMPT = (
    "You are an expert essay writer. Given a detailed outline, write the essay. "
    "Output ONLY the essay text, nothing else."
)


# ============================================================================
# Setup: download base + adapter, fuse, save to disk
# ============================================================================


def run_setup(output_dir: Path = DEFAULT_FUSED_MODEL_DIR) -> None:
    """One-time setup: download base + adapter, merge with PEFT, convert to MLX.

    The Voira LoRA adapter is in Hugging Face PEFT format (trained with Unsloth),
    which mlx_lm.fuse cannot consume directly. So we:
      1. Download the PEFT adapter snapshot.
      2. Load the fp16 HF base model (meta-llama/Meta-Llama-3.1-8B-Instruct).
      3. merge_and_unload() the adapter into the base weights.
      4. Save the merged HF model to a temp directory.
      5. Run mlx_lm.convert on the merged model with 4-bit quantization.
      6. Clean up the intermediate merged HF copy and the old base-mlx dir.

    Idempotent: if the final MLX model already exists, we skip.
    """
    output_dir = Path(output_dir).expanduser()
    if (output_dir / "config.json").exists() and (
        output_dir / "tokenizer.json"
    ).exists():
        logger.info(f"Fused MLX model already exists at {output_dir}; skipping setup.")
        return

    try:
        from huggingface_hub import snapshot_download
        from mlx_lm import convert as mlx_convert
    except ImportError as e:
        logger.error(
            "Missing inference dependencies. Install with:\n"
            "    pip install mlx-lm huggingface_hub\n"
            f"Import error: {e}"
        )
        sys.exit(1)

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel
    except ImportError as e:
        logger.error(
            "Missing merge dependencies. Install with:\n"
            "    pip install 'transformers>=4.44' 'peft>=0.12' "
            "'accelerate>=0.33' 'torch>=2.3'\n"
            f"Import error: {e}"
        )
        sys.exit(1)

    # Ensure the parent exists, but leave output_dir itself for mlx_convert to
    # create. mlx_lm.convert refuses to write to an existing directory.
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    if output_dir.exists():
        # An empty or stale directory from a previous failed run.
        if not any(output_dir.iterdir()):
            output_dir.rmdir()
        else:
            logger.error(
                f"Output dir {output_dir} already exists and is non-empty "
                "but missing config.json/tokenizer.json. Delete it and retry."
            )
            sys.exit(1)

    adapter_dir = output_dir.parent / "adapter"
    merged_tmp = output_dir.parent / "merged-hf-tmp"
    base_mlx_dir = output_dir.parent / "base-mlx"

    logger.info(f"Downloading Voira LoRA adapter from {ADAPTER_REPO}...")
    snapshot_download(repo_id=ADAPTER_REPO, local_dir=str(adapter_dir))

    if (merged_tmp / "config.json").exists():
        logger.info(f"Merged HF model already present at {merged_tmp}; reusing.")
    else:
        logger.info(
            f"Loading base model {BASE_MODEL_ID} and merging Voira LoRA adapter "
            f"(this runs on CPU in bf16; ~2-4 min)..."
        )
        base = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True,
        )
        tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID)

        logger.info(f"Applying PEFT adapter from {adapter_dir}...")
        peft_model = PeftModel.from_pretrained(base, str(adapter_dir))
        merged = peft_model.merge_and_unload()

        logger.info(f"Saving merged HF model to {merged_tmp}...")
        merged.save_pretrained(str(merged_tmp), safe_serialization=True)
        tokenizer.save_pretrained(str(merged_tmp))

        # Free Python-side references so subsequent MLX conversion has headroom.
        del merged, peft_model, base, tokenizer

    logger.info(
        f"Converting merged HF model to MLX 4-bit format -> {output_dir} "
        f"(this quantizes; ~1-2 min)..."
    )
    mlx_convert(
        hf_path=str(merged_tmp),
        mlx_path=str(output_dir),
        quantize=True,
        q_bits=4,
    )

    # Cleanup: user opted into removing all intermediates after success.
    if merged_tmp.exists():
        logger.info(f"Cleaning up intermediate merged HF model at {merged_tmp}...")
        shutil.rmtree(merged_tmp, ignore_errors=True)
    if base_mlx_dir.exists():
        logger.info(f"Cleaning up unused base-mlx directory at {base_mlx_dir}...")
        shutil.rmtree(base_mlx_dir, ignore_errors=True)

    logger.info(f"Setup complete. Fused Voira v1 model saved to {output_dir}")


# ============================================================================
# Model loading (lazy, at server startup)
# ============================================================================


_MODEL = None
_TOKENIZER = None
_MODEL_PATH: Optional[Path] = None


def load_model(model_dir: Path = DEFAULT_FUSED_MODEL_DIR):
    """Load the fused MLX model + tokenizer into process memory."""
    global _MODEL, _TOKENIZER, _MODEL_PATH

    model_dir = Path(model_dir).expanduser()
    if not model_dir.exists():
        raise FileNotFoundError(
            f"Fused MLX model not found at {model_dir}. "
            f"Run `python apps/api/inference_server.py --setup` first."
        )

    try:
        from mlx_lm import load
    except ImportError:
        raise RuntimeError(
            "mlx-lm is not installed. Activate the inference venv and run "
            "`pip install mlx-lm huggingface_hub fastapi uvicorn`."
        )

    logger.info(f"Loading fused Voira v1 MLX model from {model_dir}...")
    t0 = time.time()
    _MODEL, _TOKENIZER = load(str(model_dir))
    _MODEL_PATH = model_dir
    logger.info(f"Model loaded in {time.time() - t0:.1f}s. Ready for inference.")


# ============================================================================
# Inference
# ============================================================================


def build_prompt(outline: str) -> str:
    """Apply the Llama 3.1 chat template with Voira's training-time system prompt."""
    if _TOKENIZER is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": outline},
    ]
    return _TOKENIZER.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )


import re

# Early-stop patterns: if any of these appear in the running output, the model
# is regurgitating outline scaffolding (the known v1 failure mode where the
# LoRA runs out of trained completion content and starts emitting its own
# outline format as filler). Stop generation the moment we see them -- the
# clean prose up to that point is still usable, the rest would be garbage.
#
# We check a rolling tail window (last ~400 chars) so a short mention in an
# otherwise clean essay doesn't false-positive. The patterns are intentionally
# specific to the known collapse markers so natural prose that happens to use
# brackets (e.g. `[1]` citations) is not affected.
_EARLY_STOP_PATTERNS = [
    re.compile(r"-{2,}\s*OUTLINE\s*-{2,}", re.IGNORECASE),
    re.compile(r"-{2,}\s*END\s*-{2,}", re.IGNORECASE),
    re.compile(r"\[\s*Overall\s+Emotional\s+Arc", re.IGNORECASE),
    re.compile(r"\[\s*Overall\s+Tone", re.IGNORECASE),
    re.compile(r"\[\s*Writing\s+Voice\s*\]", re.IGNORECASE),
    re.compile(r"\[\s*Introduction\s*/\s*Hook", re.IGNORECASE),
    re.compile(r"\[\s*Word\s+Limit\s*[:\]]", re.IGNORECASE),
    re.compile(r"\[\s*Prompt\s*[:\]]", re.IGNORECASE),
    re.compile(r"\[\s*(?:MOOD|STRESS|TONAL\s+SHIFT|PACING)\s*:", re.IGNORECASE),
    # Two or more ALL-CAPS bracketed tokens near each other (e.g.
    # "[OUTGRACE:] and OUT [SALVISE] OUT [SPECIAL]") signal token-level
    # collapse into garbled scaffolding.
    re.compile(r"\[[A-Z]{3,}[^\]]{0,30}\][^\[]{0,40}\[[A-Z]{3,}"),
]

# Only start checking for collapse after we've generated at least this many
# characters of output -- the model always emits some clean prose first, and
# we don't want to abort an essay that legitimately starts with, say, a
# section heading that happens to contain a bracketed word.
_EARLY_STOP_MIN_CHARS = 400

# Check the rolling tail of this many chars. Big enough to catch multi-line
# scaffolding, small enough to not re-match stale legit content.
_EARLY_STOP_TAIL_CHARS = 500


def _has_collapse_signature(tail: str) -> bool:
    """True if the tail window of recent output looks like outline collapse."""
    return any(p.search(tail) for p in _EARLY_STOP_PATTERNS)


def run_generation(
    outline: str,
    max_new_tokens: int = 2048,
    temperature: float = 0.6,
    top_p: float = 0.9,
    repetition_penalty: float = 1.15,
) -> dict:
    """Generate an essay from an outline. Returns {"essay": str, "usage": {...}}.

    Uses streaming generation with early-stop detection: if the model starts
    regurgitating outline scaffolding mid-output (the known v1 failure mode),
    we abort generation immediately and return the clean prose up to that
    point. This is the root-cause fix for the "outline leaked into essay"
    issue -- by the time the client sees the output, the garbage is already
    truncated away.
    """
    if _MODEL is None or _TOKENIZER is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    try:
        from mlx_lm import stream_generate
        from mlx_lm.sample_utils import make_sampler, make_logits_processors
    except ImportError:
        raise RuntimeError("mlx-lm is not installed.")

    prompt = build_prompt(outline)
    prompt_tokens = len(_TOKENIZER.encode(prompt))

    t0 = time.time()
    sampler = make_sampler(temp=temperature, top_p=top_p)
    logits_processors = make_logits_processors(repetition_penalty=repetition_penalty)

    accumulated = []
    completion_tokens = 0
    finish_reason = "length"

    for response in stream_generate(
        _MODEL,
        _TOKENIZER,
        prompt=prompt,
        max_tokens=max_new_tokens,
        sampler=sampler,
        logits_processors=logits_processors,
    ):
        if response.text:
            accumulated.append(response.text)
        completion_tokens = response.generation_tokens

        # mlx-lm sets finish_reason only on the final GenerationResponse it
        # yields, so once it's populated we know the model stopped naturally.
        if response.finish_reason is not None:
            finish_reason = response.finish_reason
            break

        # Early-stop check. Only run after we have enough output to avoid
        # aborting legitimate essays that mention brackets early on, and only
        # check the rolling tail to keep it O(1) per token.
        total_len = sum(len(t) for t in accumulated)
        if total_len >= _EARLY_STOP_MIN_CHARS:
            tail = "".join(accumulated)[-_EARLY_STOP_TAIL_CHARS:]
            if _has_collapse_signature(tail):
                finish_reason = "early_stop_outline_collapse"
                logger.warning(
                    "Detected outline-scaffolding collapse mid-generation "
                    f"at token {completion_tokens}; stopping early."
                )
                break

    duration = time.time() - t0
    essay = "".join(accumulated).strip()

    # If we early-stopped mid-sentence, trim back to the last sentence
    # boundary so the client never sees a dangling fragment.
    if finish_reason == "early_stop_outline_collapse":
        essay = _trim_to_last_sentence(essay)

    logger.info(
        f"Generated essay in {duration:.1f}s "
        f"(prompt_tokens={prompt_tokens}, completion_tokens={completion_tokens}, "
        f"finish_reason={finish_reason})"
    )

    return {
        "essay": essay,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "duration_s": round(duration, 2),
            "finish_reason": finish_reason,
        },
    }


def _trim_to_last_sentence(text: str) -> str:
    """Trim text back to the last sentence-ending punctuation.

    Used after early-stop so callers never see a dangling half-sentence.
    If there's no sentence terminator (essay was pure garbage from the start),
    returns empty string -- the caller's sanitizer/fallback will handle it.
    """
    text = text.rstrip()
    if not text:
        return ""
    # Find the rightmost sentence terminator followed by whitespace or EOS.
    match = None
    for m in re.finditer(r"[.!?](?:[\"'\u201d\u2019])?(?=\s|$)", text):
        match = m
    if match is None:
        return ""
    return text[: match.end()].rstrip()


# ============================================================================
# FastAPI server
# ============================================================================


def create_app():
    """Build the FastAPI app. Imported lazily so --setup doesn't need fastapi."""
    import asyncio
    from fastapi import FastAPI, HTTPException, Header, Depends
    from pydantic import BaseModel, Field

    # Optional shared-secret auth. If VOIRA_INFERENCE_TOKEN is set, /generate
    # requires `Authorization: Bearer <token>`. The main backend sends its
    # VOIRA_MODEL_API_KEY. Even though this server binds to localhost by
    # default, requiring a token prevents other local processes from driving it.
    expected_token = os.environ.get("VOIRA_INFERENCE_TOKEN") or ""

    async def require_token(authorization: Optional[str] = Header(None)):
        if not expected_token:
            return  # Auth disabled (no token configured)
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token")
        provided = authorization.split(" ", 1)[1].strip()
        # Constant-time comparison to avoid timing leaks.
        import hmac

        if not hmac.compare_digest(provided, expected_token):
            raise HTTPException(status_code=401, detail="Invalid token")

    # Single in-flight generation. The 8B MLX model cannot serve concurrent
    # requests without OOM/contention, so serialize them. Created at startup so
    # it binds to the running event loop.
    gen_lock: "Optional[asyncio.Semaphore]" = None

    class GenerateRequest(BaseModel):
        outline: str = Field(..., min_length=1, max_length=20000)
        max_new_tokens: int = Field(default=900, ge=64, le=2200)
        temperature: float = Field(default=0.6, ge=0.0, le=2.0)
        top_p: float = Field(default=0.9, ge=0.0, le=1.0)
        repetition_penalty: float = Field(default=1.15, ge=1.0, le=2.0)

    class GenerateResponse(BaseModel):
        essay: str
        usage: dict

    app = FastAPI(title="Voira v1 Local Inference Server")

    @app.on_event("startup")
    async def _startup():
        nonlocal gen_lock
        gen_lock = asyncio.Semaphore(1)
        model_dir = Path(
            os.environ.get("VOIRA_MODEL_PATH", DEFAULT_FUSED_MODEL_DIR)
        ).expanduser()
        # Offload the blocking model load so the event loop stays responsive
        # (health checks can answer "loading" while this runs).
        await asyncio.to_thread(load_model, model_dir)

    @app.get("/health")
    async def health():
        return {
            "status": "ok" if _MODEL is not None else "loading",
            "model_loaded": _MODEL is not None,
            "model_path": str(_MODEL_PATH) if _MODEL_PATH else None,
        }

    @app.post(
        "/generate",
        response_model=GenerateResponse,
        dependencies=[Depends(require_token)],
    )
    async def generate_endpoint(req: GenerateRequest):
        if _MODEL is None:
            raise HTTPException(status_code=503, detail="Model still loading")
        try:
            # Serialize generations and run the blocking MLX call off the event
            # loop so a long generation doesn't stall health checks/cancellation.
            assert gen_lock is not None
            async with gen_lock:
                result = await asyncio.to_thread(
                    run_generation,
                    req.outline,
                    req.max_new_tokens,
                    req.temperature,
                    req.top_p,
                    req.repetition_penalty,
                )
            return result
        except HTTPException:
            raise
        except Exception:
            logger.exception("Generation failed")
            # Don't leak internal error details to the caller.
            raise HTTPException(status_code=500, detail="Generation failed")

    return app


# ============================================================================
# CLI entrypoint
# ============================================================================


def main():
    parser = argparse.ArgumentParser(description="Voira v1 local inference server")
    parser.add_argument(
        "--setup",
        action="store_true",
        help="Download base model + adapter and fuse into MLX format (one-time)",
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default=str(DEFAULT_FUSED_MODEL_DIR),
        help="Path to the fused MLX model directory",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Server host")
    parser.add_argument("--port", type=int, default=8090, help="Server port")
    args = parser.parse_args()

    if args.setup:
        run_setup(Path(args.model_dir))
        return

    try:
        import uvicorn
    except ImportError:
        logger.error("uvicorn is not installed. Run `pip install uvicorn fastapi`.")
        sys.exit(1)

    os.environ["VOIRA_MODEL_PATH"] = args.model_dir
    logger.info(f"Starting Voira v1 inference server on http://{args.host}:{args.port}")
    uvicorn.run(create_app(), host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
