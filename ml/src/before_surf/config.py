"""Typed application settings loaded from environment variables and .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str | None = None
    supabase_project_ref: str | None = None
    overpass_url: str = "https://overpass-api.de/api/interpreter"


def get_settings() -> Settings:
    return Settings()
