from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "ALMA"
    environment: str = "development"
    secret_key: str = "change_me_in_production"
    api_prefix: str = "/api/v1"

    # Database
    database_url: str = "postgresql+asyncpg://alma:alma_secret@db:5432/alma"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Anthropic (legacy)
    anthropic_api_key: str = ""

    # Gemini
    gemini_api_key: str = ""

    # File uploads
    upload_dir: str = "/app/uploads"
    max_upload_size_mb: int = 20

    # KIS file exports (picked up by cron)
    export_dir: str = "/app/exports"

    # Öffentliche Basis-URL für Player-Links (z.B. in Orbis-Anordnungen)
    alma_public_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
