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
    # Comma-separated origins the browser may call the API from. A wildcard is fine locally; in
    # production set it to the deployed frontend so the API is not readable by every site.
    allowed_origins: str = "*"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    marine_url: str = "https://marine-api.open-meteo.com/v1/marine"
    weather_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"

    @property
    def supabase_auth_issuer(self) -> str:
        """The `iss` claim Supabase puts in the access tokens it issues."""
        if not self.supabase_project_ref:
            raise RuntimeError("SUPABASE_PROJECT_REF is required to verify access tokens")
        return f"https://{self.supabase_project_ref}.supabase.co/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        """Where Supabase publishes the PUBLIC keys its tokens are signed with.

        Note what is absent here: any shared secret. Supabase signs with ES256, so this service
        holds only a verification key and could not forge a token even if its whole env leaked.
        Under the older HS256 scheme one secret both signs and verifies, which makes a leak of the
        API's config equivalent to being able to sign in as anybody.
        """
        return f"{self.supabase_auth_issuer}/.well-known/jwks.json"


def get_settings() -> Settings:
    return Settings()
