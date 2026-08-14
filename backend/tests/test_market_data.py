from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from app.models import BankRate


async def _register(client) -> str:
    resp = await client.post("/auth/register", json={"email": "market@example.com", "password": "testpassword123"})
    return resp.json()["access_token"]


async def test_exchange_rate_same_currency_is_shortcut_to_one(client):
    token = await _register(client)
    resp = await client.get(
        "/market-data/exchange-rate?base=CNY&target=CNY", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["rate"] == 1.0


async def test_exchange_rate_fetches_once_and_serves_cache_on_second_call(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.market_data._fetch_exchange_rate", return_value=Decimal("0.21")) as fetch_mock:
        first = await client.get("/market-data/exchange-rate?base=CNY&target=AUD", headers=headers)
        second = await client.get("/market-data/exchange-rate?base=CNY&target=AUD", headers=headers)

    assert first.status_code == second.status_code == 200
    assert first.json()["rate"] == second.json()["rate"] == 0.21
    fetch_mock.assert_called_once()


async def test_exchange_rate_serves_stale_cache_when_upstream_fails(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.market_data._fetch_exchange_rate", return_value=Decimal("0.21")):
        await client.get("/market-data/exchange-rate?base=CNY&target=AUD", headers=headers)

    with patch("app.market_data._fetch_exchange_rate", side_effect=RuntimeError("upstream down")):
        with patch("app.market_data._is_fresh", return_value=False):
            resp = await client.get("/market-data/exchange-rate?base=CNY&target=AUD", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["rate"] == 0.21


async def test_exchange_rate_503_when_never_cached_and_upstream_fails(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.market_data._fetch_exchange_rate", side_effect=RuntimeError("upstream down")):
        resp = await client.get("/market-data/exchange-rate?base=CNY&target=JPY", headers=headers)

    assert resp.status_code == 503


async def test_bank_rates_filters_by_country(client):
    token = await _register(client)
    async with client.session_maker() as db:
        db.add_all(
            [
                BankRate(country_code="AUS", bank_name="Test Bank AU", product_type="demand", rate=Decimal("0.10")),
                BankRate(country_code="CHN", bank_name="Test Bank CN", product_type="demand", rate=Decimal("0.20")),
            ]
        )
        await db.commit()

    resp = await client.get("/market-data/bank-rates?country=AUS", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    banks = [row["bank_name"] for row in resp.json()]
    assert banks == ["Test Bank AU"]


async def test_bank_rates_unknown_country_returns_empty_list(client):
    token = await _register(client)
    resp = await client.get("/market-data/bank-rates?country=ZZZ", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []


async def test_macro_gdp_fetches_once_and_serves_cache_on_second_call(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.market_data._fetch_gdp_per_capita", return_value=(Decimal("13293.12"), 2024)) as fetch_mock:
        first = await client.get("/market-data/macro?country=CHN&indicator=gdp_per_capita", headers=headers)
        second = await client.get("/market-data/macro?country=CHN&indicator=gdp_per_capita", headers=headers)

    assert first.status_code == second.status_code == 200
    assert first.json()["value"] == second.json()["value"] == 13293.12
    assert first.json()["year"] == 2024
    fetch_mock.assert_called_once()


async def test_macro_unsupported_indicator_returns_400(client):
    token = await _register(client)
    resp = await client.get(
        "/market-data/macro?country=CHN&indicator=avg_wage", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400


async def test_macro_stale_cache_refreshes_after_ttl(db_session):
    from app.market_data import GDP_TTL, get_gdp_per_capita
    from app.models import MacroIndicator

    stale = MacroIndicator(
        country_code="AUS",
        indicator="gdp_per_capita",
        value=Decimal("60000"),
        year=2020,
        source="world_bank",
        fetched_at=datetime.now(timezone.utc) - GDP_TTL - timedelta(days=1),
    )
    db_session.add(stale)
    await db_session.commit()

    with patch("app.market_data._fetch_gdp_per_capita", return_value=(Decimal("65000"), 2024)) as fetch_mock:
        result = await get_gdp_per_capita(db_session, "AUS")

    fetch_mock.assert_called_once()
    assert float(result.value) == 65000
    assert result.year == 2024
