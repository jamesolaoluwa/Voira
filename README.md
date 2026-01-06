# Voira Monorepo

A React + Vite frontend with a FastAPI backend, using Supabase for authentication and database.

## Structure

```
/
├── apps/
│   ├── web/          # React + Vite frontend
│   └── api/          # FastAPI backend
├── packages/
│   └── shared/       # Shared types/schemas (if needed)
├── infra/            # Docker, deployment configs
├── supabase/         # SQL migrations and RLS policies
└── tests/            # Backend tests (pytest)
```

## Development

### Prerequisites

- Node.js 18+ and npm 9+
- Python 3.11+
- Supabase account and project

### Environment Variables

**Frontend (`apps/web/.env.local`):**
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE_URL=http://localhost:8000
```

**Backend (`apps/api/.env`):**
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

### Running Locally

**Start backend:**
```bash
npm run dev:api
# or
cd apps/api && uvicorn main:app --reload --port 8000
```

**Start frontend:**
```bash
npm run dev:web
# or
cd apps/web && npm run dev
```

**Start both (concurrent):**
```bash
npm run dev
```

### Building

**Frontend:**
```bash
npm run build:web
```

**Backend:**
```bash
cd apps/api && gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

### Testing

**Backend tests:**
```bash
npm run test:api
# or
cd apps/api && pytest -q
```

## Database Setup

See `/supabase/README.md` for SQL migration instructions.

## Deployment

- **Frontend:** Deploy `apps/web/dist` to Vercel/Netlify
- **Backend:** Deploy to Render/Railway with Gunicorn + Uvicorn workers

See `/infra/README.md` for detailed deployment notes.

## Security

- Never commit service_role keys or secrets
- Frontend uses anon key only (RLS protects data)
- Backend enforces all security checks server-side
- See `/SECURITY.md` for detailed security architecture

