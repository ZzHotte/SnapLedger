from datetime import date
from uuid import uuid4

from app.models import Customer, FreightMode, Shipment, ShipmentStatus


async def _register(client, email) -> str:
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _workspace_id(client, token) -> int:
    resp = await client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
    return resp.json()[0]["id"]


async def _seed_shipment(client, workspace_id, user_id, **overrides) -> int:
    async with client.session_maker() as db:
        customer = Customer(workspace_id=workspace_id, name="Acme Corp")
        db.add(customer)
        await db.flush()
        shipment = Shipment(
            workspace_id=workspace_id,
            created_by=user_id,
            ref=f"T-{uuid4().hex[:12]}",
            customer_id=customer.id,
            freight_mode=FreightMode.FCL,
            currency="USD",
            status=ShipmentStatus.in_transit,
            destination_port="Rotterdam, NL",
            destination_lat=51.9244,
            destination_lng=4.4777,
            shipment_date=date(2026, 1, 1),
            **overrides,
        )
        db.add(shipment)
        await db.commit()
        await db.refresh(shipment)
        return shipment.id


async def test_ping_then_live_returns_the_position(client):
    token = await _register(client, "driver1@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    shipment_id = await _seed_shipment(client, workspace_id, me.json()["id"])

    ping_resp = await client.post(
        "/transport/ping",
        headers=headers,
        json={"shipment_id": shipment_id, "lat": -37.8136, "lng": 144.9631, "accuracy_m": 12.5},
    )
    assert ping_resp.status_code == 204

    live_resp = await client.get("/transport/live", headers=headers)
    assert live_resp.status_code == 200
    body = live_resp.json()
    assert len(body) == 1
    assert body[0]["shipment_id"] == shipment_id
    assert body[0]["lat"] == -37.8136
    assert body[0]["lng"] == 144.9631
    assert body[0]["accuracy_m"] == 12.5
    assert body[0]["destination_port"] == "Rotterdam, NL"
    assert body[0]["destination_lat"] == 51.9244
    assert body[0]["reported_by_name"] == "driver1@example.com"


async def test_a_second_ping_updates_the_same_row_not_a_new_one(client):
    token = await _register(client, "driver2@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    shipment_id = await _seed_shipment(client, workspace_id, me.json()["id"])

    for lat in (-37.80, -37.81, -37.82):
        resp = await client.post(
            "/transport/ping",
            headers=headers,
            json={"shipment_id": shipment_id, "lat": lat, "lng": 144.96, "accuracy_m": None},
        )
        assert resp.status_code == 204

    live_resp = await client.get("/transport/live", headers=headers)
    body = live_resp.json()
    assert len(body) == 1
    assert body[0]["lat"] == -37.82


async def test_ping_rejects_shipment_from_another_workspace(client):
    token_a = await _register(client, "ownerA@example.com")
    workspace_a = await _workspace_id(client, token_a)
    me_a = await client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"})
    shipment_id = await _seed_shipment(client, workspace_a, me_a.json()["id"])

    token_b = await _register(client, "ownerB@example.com")
    resp = await client.post(
        "/transport/ping",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"shipment_id": shipment_id, "lat": -37.8, "lng": 144.9},
    )
    assert resp.status_code == 404


async def test_live_only_returns_positions_for_the_caller_s_workspace(client):
    token_a = await _register(client, "wsA@example.com")
    workspace_a = await _workspace_id(client, token_a)
    me_a = await client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"})
    shipment_a = await _seed_shipment(client, workspace_a, me_a.json()["id"])
    await client.post(
        "/transport/ping",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"shipment_id": shipment_a, "lat": -37.8, "lng": 144.9},
    )

    token_b = await _register(client, "wsB@example.com")
    live_resp = await client.get("/transport/live", headers={"Authorization": f"Bearer {token_b}"})
    assert live_resp.json() == []


async def test_live_requires_auth(client):
    resp = await client.get("/transport/live")
    assert resp.status_code == 403
