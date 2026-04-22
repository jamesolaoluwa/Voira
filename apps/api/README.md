# Voira API (FastAPI Backend)

## Development

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Run dev server:**
```bash
uvicorn main:app --reload --port 8000
```

**Run with auto-reload:**
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Production

**Run with Gunicorn:**
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## Environment Variables

Create `.env` file:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

**Never commit `.env` or service_role keys to git.**

## Testing

```bash
pytest -q
```

## Endpoints

- `GET /health` - Health check
- `GET /auth/me` - Get current user (requires JWT)
- `GET /admin/is-admin` - Check admin status (requires JWT)
- `POST /sessions` - Create session (requires JWT, enforces credits)
- `GET /sessions` - List user sessions (requires JWT)
- `POST /transcribe` - Transcribe audio (requires JWT, placeholder)

## Voira v1 Model (Local Development)

The application-essay and draft-refine flows can run through the fine-tuned
Voira v1 LoRA model (on top of Llama 3.1 8B). In development this runs as a
separate local inference server on Apple Silicon via `mlx-lm`. In production
it points at Hugging Face Inference Endpoints or Replicate instead.

### One-time setup

```bash
# Create a separate venv so mlx-lm never ships to production
python3.11 -m venv .voira-mlx-venv
source .voira-mlx-venv/bin/activate
pip install mlx-lm huggingface_hub fastapi uvicorn

# Authenticate with HF (requires Llama 3.1 access grant on HF)
huggingface-cli login

# Download base model + adapter, fuse, quantize to 4-bit (~5 min, ~5GB)
python apps/api/inference_server.py --setup
```

### Daily dev use

```bash
# Terminal 1: start the inference server
source .voira-mlx-venv/bin/activate
python apps/api/inference_server.py           # http://localhost:8090

# Terminal 2: enable the model in apps/api/.env
#   VOIRA_MODEL_ENABLED=true
#   VOIRA_MODEL_URL=http://localhost:8090

# Then run the main backend as usual
cd apps/api && uvicorn main:app --reload
```

### Testing end-to-end

1. With both servers running, open the Speak page and record an application
   essay, or paste a draft on the Refine Draft page.
2. Confirm backend logs show `[VoiraPipeline] Routing ... through Voira v1`
   followed by `[VoiraPipeline] Success`.
3. If Voira is disabled or fails, logs will show a fallback message and the
   request is served by the existing OpenAI path -- the UX is unchanged.
4. To force the OpenAI fallback path, set `VOIRA_MODEL_ENABLED=false` or
   stop the inference server and retry.

### Rollback

Set `VOIRA_MODEL_ENABLED=false` in `.env`. No code changes required. All
session types revert to the direct OpenAI `gpt-4o-mini` path.

