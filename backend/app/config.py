from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    frontend_url: str = "http://localhost:3000"
    gemini_api_key: str = ""
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    redis_url: str = "redis://redis:6379"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def asyncpg_database_url(self) -> str:
        # asyncpg doesn't understand libpq-style params like sslmode/channel_binding
        # in the DSN query string, so strip them and pass ssl via connect_args instead.
        parsed = urlparse(self.database_url)
        query = dict(parse_qsl(parsed.query))
        query.pop("sslmode", None)
        query.pop("channel_binding", None)
        clean = parsed._replace(scheme="postgresql+asyncpg", query=urlencode(query))
        return urlunparse(clean)


@lru_cache
def get_settings() -> Settings:
    return Settings()
