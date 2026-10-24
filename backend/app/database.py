from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.asyncpg_database_url,
    connect_args={"ssl": "require"},
    # Neon's pooled (`-pooler`) endpoint is PgBouncer in transaction mode, which
    # closes idle backend connections more eagerly than a connection's own
    # lifetime would suggest. Without pre_ping, the pool hands out a connection
    # it thinks is fine, and the failure only surfaces as a DBAPIError on the
    # app's first query of the request — pre_ping catches that with a cheap
    # liveness check on checkout and transparently reconnects instead.
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session
