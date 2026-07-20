from before_surf.config import Settings, get_settings


def test_defaults_when_no_env(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    settings = Settings(_env_file=None)
    assert settings.app_env == "development"
    assert settings.database_url is None


def test_env_override(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    settings = Settings(_env_file=None)
    assert settings.app_env == "production"


def test_get_settings_returns_settings():
    assert isinstance(get_settings(), Settings)


def test_overpass_url_has_default(monkeypatch):
    monkeypatch.delenv("OVERPASS_URL", raising=False)
    settings = Settings(_env_file=None)
    assert settings.overpass_url.startswith("https://")
