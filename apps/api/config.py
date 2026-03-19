"""Configuration and environment variables."""
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings from environment variables.
    Pydantic Settings automatically reads from os.getenv() and .env file.
    """
    
    # ==========================================================================
    # REQUIRED: Core Infrastructure
    # ==========================================================================
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    
    # ==========================================================================
    # REQUIRED IN PRODUCTION: API Keys
    # ==========================================================================
    # Deepgram API key for transcription
    deepgram_api_key: Optional[str] = None
    
    # OpenAI API key for LLM refinement
    openai_api_key: Optional[str] = None
    
    # ==========================================================================
    # Environment & Deployment
    # ==========================================================================
    # Environment (development, staging, production)
    env: str = "development"
    
    # Server port (for local dev, usually overridden by hosting platform)
    port: int = 8000
    
    # ==========================================================================
    # Error Tracking & Monitoring (Sentry)
    # ==========================================================================
    # Sentry DSN for error tracking (required in production)
    sentry_dsn: Optional[str] = None
    
    # Sample rate for performance monitoring (0.0 to 1.0)
    sentry_traces_sample_rate: float = 0.1
    
    # Sample rate for profiling (0.0 to 1.0)
    sentry_profiles_sample_rate: float = 0.1
    
    # ==========================================================================
    # CORS Configuration
    # ==========================================================================
    # Allowed origins (comma-separated in env var)
    # In production, set CORS_ORIGINS=https://heyvoira.com
    # For local development, defaults include localhost origins
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    
    # ==========================================================================
    # Rate Limiting
    # ==========================================================================
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 60
    
    # Redis URL for production rate limiting (optional, uses in-memory if not set)
    redis_url: Optional[str] = None
    
    # ==========================================================================
    # Stripe Billing
    # ==========================================================================
    stripe_secret_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None
    
    # Credit allowances per plan
    stripe_credits_free: int = 10
    stripe_credits_pro: int = 60
    stripe_credits_pro_plus: int = 200  # Future tier
    
    # ==========================================================================
    # Deepgram Streaming Configuration
    # ==========================================================================
    deepgram_sample_rate: int = 48000  # Browser default sample rate
    deepgram_channels: int = 1  # Mono audio
    deepgram_encoding: str = "linear16"  # PCM encoding
    deepgram_model: str = "nova-2"  # Deepgram model
    
    # ==========================================================================
    # WebSocket Configuration
    # ==========================================================================
    ws_auth_timeout: int = 10  # seconds
    ws_idle_timeout: int = 300  # seconds
    
    # ==========================================================================
    # Request Limits
    # ==========================================================================
    # Maximum request body size in bytes (50MB default)
    max_request_size: int = 50 * 1024 * 1024
    
    # Maximum audio file size in bytes (15MB)
    max_audio_file_size: int = 15 * 1024 * 1024
    
    # Maximum transcript length in characters
    max_transcript_length: int = 50000
    
    # ==========================================================================
    # Logging
    # ==========================================================================
    # Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    log_level: str = "INFO"
    
    # Enable JSON structured logging (recommended for production)
    log_json: bool = False
    
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore"  # Ignore extra environment variables
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """
        Parse CORS origins from comma-separated string.
        
        Production: Must explicitly set CORS_ORIGINS env var
        Development: Uses defaults (localhost origins)
        
        SECURITY: Never returns wildcard '*' when credentials are enabled.
        """
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        
        # Validate no wildcards in production (credentials require explicit origins)
        if self.is_production and "*" in origins:
            raise ValueError(
                "CORS wildcard '*' is not allowed in production with credentials. "
                "Set CORS_ORIGINS to explicit origins like 'https://heyvoira.com'"
            )
        
        return origins
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.env.lower() == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.env.lower() == "development"


settings = Settings()

