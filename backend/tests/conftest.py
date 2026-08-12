import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.main import app


async def _new_test_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine


@pytest.fixture
async def client():
    engine = await _new_test_engine()
    test_session = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with test_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # exposed so tests can seed rows (e.g. a second ledger member) that
        # aren't reachable yet through the HTTP API (invite flow is Week 4)
        ac.session_maker = test_session
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.fixture
async def db_session():
    """A raw DB session for testing modules directly (no HTTP layer)."""
    engine = await _new_test_engine()
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
