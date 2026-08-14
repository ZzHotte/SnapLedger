import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BankRate, ExchangeRate, MacroIndicator

logger = logging.getLogger(__name__)

EXCHANGE_RATE_TTL = timedelta(hours=12)
GDP_TTL = timedelta(days=30)

FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
WORLD_BANK_GDP_URL = "https://api.worldbank.org/v2/country/{country}/indicator/NY.GDP.PCAP.CD"


class MarketDataUnavailable(Exception):
    """Raised when a rate/indicator was never cached and the upstream fetch also fails."""


def _is_fresh(fetched_at: datetime, ttl: timedelta) -> bool:
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - fetched_at < ttl


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

    existing = await db.scalar(
        select(ExchangeRate).where(ExchangeRate.base_currency == base, ExchangeRate.target_currency == target)
    )
    if existing is not None and _is_fresh(existing.fetched_at, EXCHANGE_RATE_TTL):
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
    else:
        existing = ExchangeRate(base_currency=base, target_currency=target, rate=rate, fetched_at=now)
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return existing


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
    existing = await db.scalar(
        select(MacroIndicator).where(
            MacroIndicator.country_code == country_code, MacroIndicator.indicator == "gdp_per_capita"
        )
    )
    if existing is not None and _is_fresh(existing.fetched_at, GDP_TTL):
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
    else:
        existing = MacroIndicator(
            country_code=country_code,
            indicator="gdp_per_capita",
            value=value,
            year=year,
            source="world_bank",
            fetched_at=now,
        )
        db.add(existing)
    await db.commit()
    await db.refresh(existing)
    return existing


async def list_bank_rates(db: AsyncSession, country_code: str) -> list[BankRate]:
    # No free, unified API for deposit rates (per the architecture doc) — this
    # table is a hand-curated reference seeded via migration, not live-fetched.
    result = await db.scalars(
        select(BankRate)
        .where(BankRate.country_code == country_code.upper())
        .order_by(BankRate.bank_name, BankRate.product_type)
    )
    return list(result.all())
