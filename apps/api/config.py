"""Configuration and environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings from environment variables."""
    
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    
    # Rate limiting (dev: in-memory, prod: TODO Redis/Upstash)
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 60
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"  # Ignore extra environment variables
    )


settings = Settings()

