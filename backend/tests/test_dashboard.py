from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.dashboard import last_n_months, month_bounds
from app.models import Category, Transaction


async def _register(client, email) -> str:
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _ledger_id(client, token) -> int:
    resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {token}"})
    return resp.json()[0]["id"]


async def _add_transaction(client, ledger_id, token, category_name, amount, tx_date):
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    async with client.session_maker() as db:
        category = await db.scalar(
            select(Category).where(Category.ledger_id == ledger_id, Category.name == category_name)
        )
        db.add(
            Transaction(
                ledger_id=ledger_id,
                created_by=user_id,
                amount=Decimal(str(amount)),
                currency="USD",
                category_id=category.id,
                transaction_date=date.fromisoformat(tx_date),
            )
        )
        await db.commit()


def test_last_n_months_wraps_around_year_boundary():
    assert last_n_months("2026-02", n=4) == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_last_n_months_defaults_to_six():
    assert last_n_months("2026-08") == ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]


def test_month_bounds_handles_leap_february():
    assert month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))


async def test_dashboard_defaults_to_current_month(client):
    token = await _register(client, "user1@example.com")
    resp = await client.get("/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["month"] == date.today().strftime("%Y-%m")


async def test_dashboard_aggregates_category_breakdown_and_total(client):
    token = await _register(client, "user2@example.com")
    ledger_id = await _ledger_id(client, token)
    await _add_transaction(client, ledger_id, token, "Food", "50.00", "2026-08-05")
    await _add_transaction(client, ledger_id, token, "Food", "25.50", "2026-08-10")
    await _add_transaction(client, ledger_id, token, "Transport", "10.00", "2026-08-15")
    # outside the requested month — must not be counted
    await _add_transaction(client, ledger_id, token, "Food", "999.00", "2026-07-20")

    resp = await client.get(
        f"/dashboard/summary?ledger_id={ledger_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_spent"] == 85.5
    breakdown = {c["category"]: c["amount"] for c in body["category_breakdown"]}
    assert breakdown == {"Food": 75.5, "Transport": 10.0}


async def test_dashboard_monthly_trend_covers_six_months_including_older_spend(client):
    token = await _register(client, "user3@example.com")
    ledger_id = await _ledger_id(client, token)
    await _add_transaction(client, ledger_id, token, "Food", "100.00", "2026-08-01")
    await _add_transaction(client, ledger_id, token, "Food", "40.00", "2026-05-01")

    resp = await client.get(
        f"/dashboard/summary?ledger_id={ledger_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    trend = {t["month"]: t["amount"] for t in resp.json()["monthly_trend"]}
    assert trend == {
        "2026-03": 0.0,
        "2026-04": 0.0,
        "2026-05": 40.0,
        "2026-06": 0.0,
        "2026-07": 0.0,
        "2026-08": 100.0,
    }


async def test_dashboard_budget_vs_actual_includes_zero_spend_and_excludes_unbudgeted_categories(client):
    token = await _register(client, "user4@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    ledger_id = await _ledger_id(client, token)

    await client.put(
        f"/budgets?ledger_id={ledger_id}", headers=headers, json={"category": "Food", "month": "2026-08", "planned_amount": 200}
    )
    await client.put(
        f"/budgets?ledger_id={ledger_id}",
        headers=headers,
        json={"category": "Entertainment", "month": "2026-08", "planned_amount": 50},
    )
    await _add_transaction(client, ledger_id, token, "Food", "120.00", "2026-08-03")
    # Transport has spend but no budget — shouldn't show up in `budgets`
    await _add_transaction(client, ledger_id, token, "Transport", "30.00", "2026-08-04")

    resp = await client.get(f"/dashboard/summary?ledger_id={ledger_id}&month=2026-08", headers=headers)
    budgets = {b["category"]: b for b in resp.json()["budgets"]}
    assert budgets["Food"]["planned_amount"] == 200.0
    assert budgets["Food"]["actual_amount"] == 120.0
    assert budgets["Entertainment"]["planned_amount"] == 50.0
    assert budgets["Entertainment"]["actual_amount"] == 0.0
    assert "Transport" not in budgets


async def test_dashboard_404_for_ledger_caller_is_not_a_member_of(client):
    owner_token = await _register(client, "owner5@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    outsider_token = await _register(client, "outsider5@example.com")

    resp = await client.get(
        f"/dashboard/summary?ledger_id={ledger_id}", headers={"Authorization": f"Bearer {outsider_token}"}
    )
    assert resp.status_code == 404
