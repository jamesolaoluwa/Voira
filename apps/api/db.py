"""Supabase database client (server-side only)."""
from supabase import create_client, Client
from config import settings

# Create Supabase client with service_role key (backend only)
# NEVER expose this to the frontend
supabase: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key
)

