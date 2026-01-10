"""Configuration and environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings from environment variables.
    Pydantic Settings automatically reads from os.getenv() and .env file.
    """
    
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    
    # Environment (development, staging, production)
    # Reads from ENV environment variable, defaults to "development"
    env: str = "development"
    
    # Rate limiting (dev: in-memory, prod: TODO Redis/Upstash)
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 60
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"  # Ignore extra environment variables
    )


settings = Settings()

