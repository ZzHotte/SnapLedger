import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Awaitable, Callable

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import EXCHANGE_RATE_TTL, FRANKFURTER_URL, GDP_TTL, WORLD_BANK_GDP_URL
from app.models import BankRate, ExchangeRate, MacroIndicator

logger = logging.getLogger(__name__)


class MarketDataUnavailable(Exception):
    """Raised when a rate/indicator was never cached and the upstream fetch also fails."""


def _is_fresh(fetched_at: datetime, ttl: timedelta) -> bool:
    return datetime.now(timezone.utc) - fetched_at < ttl


def _normalize_fetched_at(row: ExchangeRate | MacroIndicator) -> None:
    # Postgres/asyncpg (prod) round-trips DateTime(timezone=True) as aware;
    # SQLite (the test DB only) drops tzinfo. Normalize in place right after
    # reading so every return path — cache hit or freshly written — hands
    # callers/API responses a consistently aware datetime either way.
    if row.fetched_at.tzinfo is None:
        row.fetched_at = row.fetched_at.replace(tzinfo=timezone.utc)


async def _fetch_exchange_rate(base: str, target: str) -> Decimal:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(FRANKFURTER_URL, params={"base": base, "symbols": target})
        resp.raise_for_status()
        rate = resp.json()["rates"][target]
        return Decimal(str(rate))


async def get_exchange_rate(db: AsyncSession, base: str, target: str) -> ExchangeRate:
    """DB-cached wrapper around the Frankfurter API (TTL'd, not a scheduled job —
    Render's free tier can spin down between requests, so an in-process
    scheduler wouldn't fire reliably; fetch-on-read is the workable version of
    the architecture doc's "cache + scheduled refresh" for this hosting tier).
    On upstream failure, serves the last cached value rather than erroring, as
    long as one exists."""
    base, target = base.upper(), target.upper()

    if base == target:
        return ExchangeRate(base_currency=base, target_currency=target, rate=Decimal("1"), fetched_at=datetime.now(timezone.utc))

    lookup = select(ExchangeRate).where(ExchangeRate.base_currency == base, ExchangeRate.target_currency == target)
    existing = await db.scalar(lookup)
    if existing is not None:
        _normalize_fetched_at(existing)
        if _is_fresh(existing.fetched_at, EXCHANGE_RATE_TTL):
            return existing

    try:
        rate = await _fetch_exchange_rate(base, target)
    except Exception:
        logger.exception("Failed to fetch exchange rate %s->%s", base, target)
        if existing is not None:
            return existing
        raise MarketDataUnavailable(f"No exchange rate available for {base}->{target}")

    now = datetime.now(timezone.utc)
    if existing is not None:
        existing.rate = rate
        existing.fetched_at = now
        await db.commit()
        await db.refresh(existing)
        return existing

    new_row = ExchangeRate(base_currency=base, target_currency=target, rate=rate, fetched_at=now)
    db.add(new_row)
    try:
        await db.commit()
    except IntegrityError:
        # Another request raced us: it also missed the cache and committed the
        # same (base, target) pair between our SELECT and this INSERT — same
        # class of race routers/budgets.py handles for its upsert. Fall back to
        # updating theirs with our freshly-fetched value instead of erroring.
        await db.rollback()
        new_row = await db.scalar(lookup)
        new_row.rate = rate
        new_row.fetched_at = now
        await db.commit()
    await db.refresh(new_row)
    return new_row


async def _fetch_gdp_per_capita(country_code: str) -> tuple[Decimal, int]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            WORLD_BANK_GDP_URL.format(country=country_code),
            params={"format": "json", "date": "2018:2024", "per_page": 20},
        )
        resp.raise_for_status()
        payload = resp.json()
        rows = payload[1] if len(payload) > 1 and payload[1] else []
        for row in rows:
            if row.get("value") is not None:
                return Decimal(str(row["value"])), int(row["date"])
        raise ValueError(f"No GDP data available for {country_code}")


async def get_gdp_per_capita(db: AsyncSession, country_code: str) -> MacroIndicator:
    country_code = country_code.upper()
    lookup = select(MacroIndicator).where(
        MacroIndicator.country_code == country_code, MacroIndicator.indicator == "gdp_per_capita"
    )
    existing = await db.scalar(lookup)
    if existing is not None:
        _normalize_fetched_at(existing)
        if _is_fresh(existing.fetched_at, GDP_TTL):
            return existing

    try:
        value, year = await _fetch_gdp_per_capita(country_code)
    except Exception:
        logger.exception("Failed to fetch GDP per capita for %s", country_code)
        if existing is not None:
            return existing
        raise MarketDataUnavailable(f"No GDP data available for {country_code}")

    now = datetime.now(timezone.utc)
    if existing is not None:
        existing.value = value
        existing.year = year
        existing.fetched_at = now
        await db.commit()
        await db.refresh(existing)
        return existing

    new_row = MacroIndicator(
        country_code=country_code,
        indicator="gdp_per_capita",
        value=value,
        year=year,
        source="world_bank",
        fetched_at=now,
    )
    db.add(new_row)
    try:
        await db.commit()
    except IntegrityError:
        # Same race as get_exchange_rate above, on (country_code, indicator).
        await db.rollback()
        new_row = await db.scalar(lookup)
        new_row.value = value
        new_row.year = year
        new_row.fetched_at = now
        await db.commit()
    await db.refresh(new_row)
    return new_row


async def list_bank_rates(db: AsyncSession, country_code: str) -> list[BankRate]:
    # No free, unified API for deposit rates (per the architecture doc) — this
    # table is a hand-curated reference seeded via migration, not live-fetched.
    result = await db.scalars(
        select(BankRate)
        .where(BankRate.country_code == country_code.upper())
        .order_by(BankRate.bank_name, BankRate.product_type)
    )
    return list(result.all())


# Which indicator the /market-data/macro endpoint has a real fetcher for. Keyed
# by indicator name so adding a new one requires wiring an actual handler here
# rather than just adding a string to a "supported" set elsewhere — the
# previous version had a bare SUPPORTED_MACRO_INDICATORS set in constants.py
# that get_gdp_per_capita's hardcoded "gdp_per_capita" wasn't actually derived
# from, so a second entry could silently reuse GDP's fetcher and mislabel data.
MACRO_INDICATOR_FETCHERS: dict[str, Callable[[AsyncSession, str], Awaitable[MacroIndicator]]] = {
    "gdp_per_capita": get_gdp_per_capita,
}
SUPPORTED_MACRO_INDICATORS = set(MACRO_INDICATOR_FETCHERS)
