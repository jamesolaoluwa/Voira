# Infrastructure & Deployment

## Backend Deployment (Render/Railway)

### Environment Variables

Set in your hosting platform:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
PORT=8000
```

### Build Command

```bash
pip install -r apps/api/requirements.txt
```

### Start Command

```bash
cd apps/api && gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
```

### Docker (Optional)

See `Dockerfile` for containerized deployment.

## Frontend Deployment (Vercel/Netlify)

### Build Command

```bash
cd apps/web && npm install && npm run build
```

### Output Directory

```
apps/web/dist
```

### Environment Variables (Vercel/Netlify)

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=https://your-backend-url.render.com
```

## Rate Limiting

**Development:** In-memory rate limiter (simple, not distributed)

**Production:** TODO - Use Redis/Upstash for distributed rate limiting

## Scaling Notes

- Backend: Use Gunicorn with multiple Uvicorn workers
- Frontend: Static files served via CDN (Vercel/Netlify)
- Database: Supabase handles scaling
- Rate Limiting: Add Redis/Upstash in production

