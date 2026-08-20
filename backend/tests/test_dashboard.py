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


async def _add_shipment(client, workspace_id, token, ship_date, status=ShipmentStatus.inquiry, customer_id=None):
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    user_id = me.json()["id"]

    async with client.session_maker() as db:
        db.add(
            Shipment(
                workspace_id=workspace_id,
                created_by=user_id,
                customer_id=customer_id,
                freight_mode=FreightMode.FCL,
                currency="USD",
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


async def test_dashboard_404_for_workspace_caller_is_not_a_member_of(client):
    owner_token = await _register(client, "owner5@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    outsider_token = await _register(client, "outsider5@example.com")

    resp = await client.get(
        f"/dashboard/summary?workspace_id={workspace_id}", headers={"Authorization": f"Bearer {outsider_token}"}
    )
    assert resp.status_code == 404
