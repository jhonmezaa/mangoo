"""
Application configuration using Pydantic Settings.
Loads from environment variables and .env file.
"""
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings and configuration."""

    # Application
    APP_NAME: str = "Mangoo AI Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # API
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Database
    DATABASE_URL: str
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    # AWS Cognito
    COGNITO_USER_POOL_ID: str
    COGNITO_APP_CLIENT_ID: str
    COGNITO_REGION: str = "us-east-1"
    COGNITO_ISSUER: Optional[str] = None

    # AWS Bedrock
    BEDROCK_REGION: str = "us-east-1"
    BEDROCK_MODEL_ID: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    BEDROCK_EMBEDDING_MODEL_ID: str = "amazon.titan-embed-text-v2:0"
    BEDROCK_MAX_TOKENS: int = 4096
    BEDROCK_TEMPERATURE: float = 0.7

    # Vector Search
    VECTOR_DIMENSION: int = 1024  # Titan Embeddings v2 dimension
    VECTOR_TOP_K: int = 5
    VECTOR_SIMILARITY_THRESHOLD: float = 0.7

    # SSE Configuration
    SSE_RETRY_TIMEOUT: int = 15000
    SSE_KEEPALIVE_INTERVAL: int = 30

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Auto-generate Cognito issuer if not provided
        if not self.COGNITO_ISSUER:
            self.COGNITO_ISSUER = (
                f"https://cognito-idp.{self.COGNITO_REGION}.amazonaws.com/"
                f"{self.COGNITO_USER_POOL_ID}"
            )


settings = Settings()
