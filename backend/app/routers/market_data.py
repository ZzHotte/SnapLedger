from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.market_data import MACRO_INDICATOR_FETCHERS, SUPPORTED_MACRO_INDICATORS, MarketDataUnavailable, get_exchange_rate, list_bank_rates
from app.models import User
from app.schemas import BankRateOut, ExchangeRateOut, MacroIndicatorOut

router = APIRouter(prefix="/market-data", tags=["market-data"])

CURRENCY_PATTERN = r"^[A-Za-z]{3}$"
COUNTRY_PATTERN = r"^[A-Za-z]{3}$"


@router.get("/exchange-rate", response_model=ExchangeRateOut)
async def exchange_rate(
    base: str = Query(pattern=CURRENCY_PATTERN),
    target: str = Query(pattern=CURRENCY_PATTERN),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    try:
        rate = await get_exchange_rate(db, base, target)
    except MarketDataUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return ExchangeRateOut(
        base=rate.base_currency, target=rate.target_currency, rate=float(rate.rate), fetched_at=rate.fetched_at
    )


@router.get("/bank-rates", response_model=list[BankRateOut])
async def bank_rates(
    country: str = Query(pattern=COUNTRY_PATTERN),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    rows = await list_bank_rates(db, country)
    return [
        BankRateOut(
            country=r.country_code,
            bank_name=r.bank_name,
            product_type=r.product_type,
            term_months=r.term_months,
            rate=float(r.rate),
            source_url=r.source_url,
        )
        for r in rows
    ]


@router.get("/macro", response_model=MacroIndicatorOut)
async def macro_indicator(
    country: str = Query(pattern=COUNTRY_PATTERN),
    indicator: str = Query(pattern=r"^[a-z_]+$"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    if indicator not in SUPPORTED_MACRO_INDICATORS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported indicator: {indicator}")
    try:
        row = await MACRO_INDICATOR_FETCHERS[indicator](db, country)
    except MarketDataUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    return MacroIndicatorOut(
        country=row.country_code,
        indicator=row.indicator,
        value=float(row.value),
        year=row.year,
        source=row.source,
        fetched_at=row.fetched_at,
    )
