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
    if (output_dir / "config.json").exists() and (output_dir / "tokenizer.json").exists():
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


def run_generation(
    outline: str,
    max_new_tokens: int = 2048,
    temperature: float = 0.7,
    top_p: float = 0.9,
    repetition_penalty: float = 1.1,
) -> dict:
    """Generate an essay from an outline. Returns {"essay": str, "usage": {...}}."""
    if _MODEL is None or _TOKENIZER is None:
        raise RuntimeError("Model not loaded. Call load_model() first.")

    try:
        from mlx_lm import generate
        from mlx_lm.sample_utils import make_sampler, make_logits_processors
    except ImportError:
        raise RuntimeError("mlx-lm is not installed.")

    prompt = build_prompt(outline)
    prompt_tokens = len(_TOKENIZER.encode(prompt))

    t0 = time.time()
    sampler = make_sampler(temp=temperature, top_p=top_p)
    logits_processors = make_logits_processors(repetition_penalty=repetition_penalty)
    essay = generate(
        _MODEL,
        _TOKENIZER,
        prompt=prompt,
        max_tokens=max_new_tokens,
        sampler=sampler,
        logits_processors=logits_processors,
        verbose=False,
    )
    duration = time.time() - t0

    essay = essay.strip()
    completion_tokens = len(_TOKENIZER.encode(essay))

    logger.info(
        f"Generated essay in {duration:.1f}s "
        f"(prompt_tokens={prompt_tokens}, completion_tokens={completion_tokens})"
    )

    return {
        "essay": essay,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "duration_s": round(duration, 2),
        },
    }


# ============================================================================
# FastAPI server
# ============================================================================


def create_app():
    """Build the FastAPI app. Imported lazily so --setup doesn't need fastapi."""
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel, Field

    class GenerateRequest(BaseModel):
        outline: str = Field(..., min_length=1, max_length=20000)
        max_new_tokens: int = Field(default=2048, ge=64, le=4096)
        temperature: float = Field(default=0.7, ge=0.0, le=2.0)
        top_p: float = Field(default=0.9, ge=0.0, le=1.0)
        repetition_penalty: float = Field(default=1.1, ge=1.0, le=2.0)

    class GenerateResponse(BaseModel):
        essay: str
        usage: dict

    app = FastAPI(title="Voira v1 Local Inference Server")

    @app.on_event("startup")
    async def _startup():
        model_dir = Path(os.environ.get("VOIRA_MODEL_PATH", DEFAULT_FUSED_MODEL_DIR)).expanduser()
        load_model(model_dir)

    @app.get("/health")
    async def health():
        return {
            "status": "ok" if _MODEL is not None else "loading",
            "model_loaded": _MODEL is not None,
            "model_path": str(_MODEL_PATH) if _MODEL_PATH else None,
        }

    @app.post("/generate", response_model=GenerateResponse)
    async def generate_endpoint(req: GenerateRequest):
        try:
            result = run_generation(
                outline=req.outline,
                max_new_tokens=req.max_new_tokens,
                temperature=req.temperature,
                top_p=req.top_p,
                repetition_penalty=req.repetition_penalty,
            )
            return result
        except Exception as e:
            logger.exception("Generation failed")
            raise HTTPException(status_code=500, detail=str(e))

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
