"""
Supabase database client (server-side only).

CONNECTION POOLING:
This module uses Supabase, which handles connection pooling automatically.
However, for production applications with high concurrency, connection pool
sizing is critical.

SUPABASE CONFIGURATION (via Supabase Dashboard):
1. Go to Project Settings → Database
2. Set connection pool size:
   - Default: 10-20 connections
   - Production: Size based on expected concurrent users
   - Formula: (avg_concurrent_users * avg_query_time / 60) + buffer
   - Example: (1000 users * 0.05s query / 60) + 5 = 12 connections

3. Set idle timeout:
   - Recommended: 30 seconds
   - Prevents holding idle connections

4. Enable connection statistics:
   - Monitor connection pool usage in Supabase dashboard
   - Alert if usage > 80% of pool size

MONITORING:
- Check Supabase dashboard for connection pool metrics
- Monitor in Sentry: Database connection errors
- Alert on pool exhaustion to prevent 503 errors

BEST PRACTICES:
- Keep queries short and efficient
- Use indexes for common queries
- Implement query timeouts (handled by middleware.py)
- Use connection pooling for distributed deployments
- Archive old sessions to reduce table size

QUERY LOGGING:
- Slow queries (>500ms) are logged to Sentry for visibility
- Use log_slow_query() helper for manual instrumentation
- Helps identify optimization opportunities
"""

import logging
from supabase import create_client, Client
from config import settings
from sentry_config import capture_message

logger = logging.getLogger(__name__)

# Slow query threshold (milliseconds)
SLOW_QUERY_THRESHOLD_MS = 500

# Create Supabase client with service_role key (backend only)
# NEVER expose this to the frontend
supabase: Client = create_client(
    settings.supabase_url, settings.supabase_service_role_key
)

logger.info("Supabase database client initialized")


def log_slow_query(
    table: str, operation: str, duration_ms: float, query_summary: str = ""
):
    """Log slow database queries to Sentry for monitoring.

    Call this after database operations to track slow queries.

    Args:
        table: Table name affected
        operation: Type of operation (SELECT, INSERT, UPDATE, DELETE)
        duration_ms: Query execution time in milliseconds
        query_summary: Brief query description (no sensitive data)
    """
    if duration_ms > SLOW_QUERY_THRESHOLD_MS:
        message = f"Slow query: {operation} on {table} ({duration_ms:.0f}ms)"
        logger.warning(f"{message} - {query_summary}")
        capture_message(
            message,
            level="warning",
            extra={
                "table": table,
                "operation": operation,
                "duration_ms": duration_ms,
                "query_summary": query_summary,
            },
        )


logger.info(
    "Connection pooling is handled by Supabase. "
    "See module docstring for pool size configuration."
)
