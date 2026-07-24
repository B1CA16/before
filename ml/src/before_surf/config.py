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
    marine_url: str = "https://marine-api.open-meteo.com/v1/marine"
    weather_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"


def get_settings() -> Settings:
    return Settings()
