from datetime import date

from app.dashboard import last_n_months, month_bounds
from app.models import Customer, FreightMode, Shipment, ShipmentStatus


async def _register(client, email) -> str:
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _workspace_id(client, token) -> int:
    resp = await client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
    return resp.json()[0]["id"]


async def _add_customer(client, workspace_id, name) -> int:
    async with client.session_maker() as db:
        customer = Customer(workspace_id=workspace_id, name=name)
        db.add(customer)
        await db.commit()
        await db.refresh(customer)
        return customer.id


async def _add_shipment(
    client,
    workspace_id,
    token,
    ship_date,
    status=ShipmentStatus.inquiry,
    customer_id=None,
    freight_cost=None,
    currency="USD",
):
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    async with client.session_maker() as db:
        db.add(
            Shipment(
                workspace_id=workspace_id,
                created_by=user_id,
                customer_id=customer_id,
                freight_mode=FreightMode.FCL,
                currency=currency,
                freight_cost=freight_cost,
                status=status,
                shipment_date=date.fromisoformat(ship_date),
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


async def test_dashboard_aggregates_status_breakdown_and_total(client):
    token = await _register(client, "user2@example.com")
    workspace_id = await _workspace_id(client, token)
    await _add_shipment(client, workspace_id, token, "2026-08-05", status=ShipmentStatus.booked)
    await _add_shipment(client, workspace_id, token, "2026-08-10", status=ShipmentStatus.booked)
    await _add_shipment(client, workspace_id, token, "2026-08-15", status=ShipmentStatus.delivered)
    # outside the requested month — must not be counted
    await _add_shipment(client, workspace_id, token, "2026-07-20", status=ShipmentStatus.booked)

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_shipments"] == 3
    breakdown = {s["status"]: s["count"] for s in body["status_breakdown"]}
    assert breakdown == {"booked": 2, "delivered": 1}
    # sorted by count descending
    assert body["status_breakdown"][0]["status"] == "booked"


async def test_dashboard_excludes_cancelled_from_total_but_keeps_it_in_status_breakdown(client):
    token = await _register(client, "user2b@example.com")
    workspace_id = await _workspace_id(client, token)
    await _add_shipment(client, workspace_id, token, "2026-08-05", status=ShipmentStatus.booked)
    await _add_shipment(client, workspace_id, token, "2026-08-06", status=ShipmentStatus.cancelled)
    await _add_shipment(client, workspace_id, token, "2026-08-07", status=ShipmentStatus.cancelled)

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()
    assert body["total_shipments"] == 1

    breakdown = {s["status"]: s["count"] for s in body["status_breakdown"]}
    assert breakdown == {"booked": 1, "cancelled": 2}


async def test_dashboard_amounts_grouped_by_currency(client):
    token = await _register(client, "user2c@example.com")
    workspace_id = await _workspace_id(client, token)
    await _add_shipment(client, workspace_id, token, "2026-08-05", status=ShipmentStatus.booked, freight_cost=1000, currency="USD")
    await _add_shipment(client, workspace_id, token, "2026-08-06", status=ShipmentStatus.booked, freight_cost=500, currency="USD")
    await _add_shipment(client, workspace_id, token, "2026-08-07", status=ShipmentStatus.booked, freight_cost=200, currency="EUR")
    # cancelled and with a cost — must not contribute to total_amounts
    await _add_shipment(client, workspace_id, token, "2026-08-08", status=ShipmentStatus.cancelled, freight_cost=9999, currency="USD")

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()

    total_amounts = {a["currency"]: a["amount"] for a in body["total_amounts"]}
    assert total_amounts == {"USD": 1500.0, "EUR": 200.0}

    booked = next(s for s in body["status_breakdown"] if s["status"] == "booked")
    booked_amounts = {a["currency"]: a["amount"] for a in booked["amounts"]}
    assert booked_amounts == {"USD": 1500.0, "EUR": 200.0}

    cancelled = next(s for s in body["status_breakdown"] if s["status"] == "cancelled")
    cancelled_amounts = {a["currency"]: a["amount"] for a in cancelled["amounts"]}
    assert cancelled_amounts == {"USD": 9999.0}


async def test_dashboard_monthly_trend_covers_six_months_including_older_shipments(client):
    token = await _register(client, "user3@example.com")
    workspace_id = await _workspace_id(client, token)
    await _add_shipment(client, workspace_id, token, "2026-08-01")
    await _add_shipment(client, workspace_id, token, "2026-08-02")
    await _add_shipment(client, workspace_id, token, "2026-05-01")

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    trend = {t["month"]: t["count"] for t in resp.json()["monthly_trend"]}
    assert trend == {
        "2026-03": 0,
        "2026-04": 0,
        "2026-05": 1,
        "2026-06": 0,
        "2026-07": 0,
        "2026-08": 2,
    }


async def test_dashboard_monthly_trend_excludes_cancelled(client):
    token = await _register(client, "user3b@example.com")
    workspace_id = await _workspace_id(client, token)
    await _add_shipment(client, workspace_id, token, "2026-08-01", status=ShipmentStatus.booked)
    await _add_shipment(client, workspace_id, token, "2026-08-02", status=ShipmentStatus.cancelled)

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    trend = {t["month"]: t["count"] for t in resp.json()["monthly_trend"]}
    assert trend["2026-08"] == 1


async def test_dashboard_monthly_status_breakdown_covers_every_trend_month(client):
    token = await _register(client, "user3c@example.com")
    workspace_id = await _workspace_id(client, token)
    await _add_shipment(client, workspace_id, token, "2026-05-10", status=ShipmentStatus.delivered)
    await _add_shipment(client, workspace_id, token, "2026-05-11", status=ShipmentStatus.cancelled)
    await _add_shipment(client, workspace_id, token, "2026-08-01", status=ShipmentStatus.booked)

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    body = resp.json()
    by_month = {m["month"]: m for m in body["monthly_status_breakdown"]}

    assert set(by_month.keys()) == {"2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"}

    may_breakdown = {s["status"]: s["count"] for s in by_month["2026-05"]["status_breakdown"]}
    assert may_breakdown == {"delivered": 1, "cancelled": 1}

    march_breakdown = by_month["2026-03"]["status_breakdown"]
    assert march_breakdown == []

    # the top-level status_breakdown (for `month`) is exactly the last trend
    # month's entry — no drift between the two representations.
    assert body["status_breakdown"] == by_month["2026-08"]["status_breakdown"]


async def test_dashboard_top_customers_orders_by_count_and_groups_unassigned(client):
    token = await _register(client, "user4@example.com")
    workspace_id = await _workspace_id(client, token)
    big_customer = await _add_customer(client, workspace_id, "Big Shipper Co")
    small_customer = await _add_customer(client, workspace_id, "Small Shipper Co")

    await _add_shipment(client, workspace_id, token, "2026-08-03", customer_id=big_customer)
    await _add_shipment(client, workspace_id, token, "2026-08-04", customer_id=big_customer)
    await _add_shipment(client, workspace_id, token, "2026-08-05", customer_id=small_customer)
    # no customer attached — should be grouped under "Unassigned"
    await _add_shipment(client, workspace_id, token, "2026-08-06", customer_id=None)

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    top_customers = resp.json()["top_customers"]
    counts = {c["customer_name"]: c["shipment_count"] for c in top_customers}
    assert counts == {"Big Shipper Co": 2, "Small Shipper Co": 1, "Unassigned": 1}
    assert top_customers[0]["customer_name"] == "Big Shipper Co"


async def test_dashboard_top_customers_excludes_cancelled(client):
    token = await _register(client, "user4b@example.com")
    workspace_id = await _workspace_id(client, token)
    customer_id = await _add_customer(client, workspace_id, "Acme Corp")

    await _add_shipment(client, workspace_id, token, "2026-08-03", customer_id=customer_id, status=ShipmentStatus.booked)
    await _add_shipment(client, workspace_id, token, "2026-08-04", customer_id=customer_id, status=ShipmentStatus.cancelled)

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}&month=2026-08", headers={"Authorization": f"Bearer {token}"}
    )
    top_customers = {c["customer_name"]: c["shipment_count"] for c in resp.json()["top_customers"]}
    assert top_customers == {"Acme Corp": 1}


async def test_dashboard_404_for_workspace_caller_is_not_a_member_of(client):
    owner_token = await _register(client, "owner5@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    outsider_token = await _register(client, "outsider5@example.com")

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}", headers={"Authorization": f"Bearer {outsider_token}"}
    )
    assert resp.status_code == 404
