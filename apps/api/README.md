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

