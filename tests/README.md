# Backend Tests

Pytest tests for the FastAPI backend.

## Running Tests

```bash
cd apps/api
pytest ../tests -v
```

Or from the root:
```bash
pytest tests -v
```

## Test Coverage

- `/health` - Health check endpoint
- `/auth/me` - Authentication required, returns user info
- `/admin/is-admin` - Returns boolean only, denies unauthenticated
- `/sessions` - Enforces ownership and credits
- Admin bypass - Admins bypass credit checks

## Test Structure

- `test_health.py` - Health endpoint tests
- `test_auth.py` - Authentication endpoint tests
- `test_admin.py` - Admin check endpoint tests
- `test_sessions.py` - Session CRUD and credit enforcement tests

## CI Ready

Tests can be run in CI with:
```bash
pytest -q
```

The `-q` flag provides quiet output suitable for CI pipelines.

