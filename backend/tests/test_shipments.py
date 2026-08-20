from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy import select

from app.models import (
    Customer,
    FreightMode,
    MemberStatus,
    Shipment,
    ShipmentStatus,
    User,
    WorkspaceMember,
    WorkspaceRole,
)


async def _register(client, email) -> str:
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _workspace_id(client, token) -> int:
    resp = await client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
    return resp.json()[0]["id"]


async def _add_member(client, workspace_id, email, role) -> str:
    token = await _register(client, email)
    async with client.session_maker() as db:
        user = await db.scalar(select(User).where(User.email == email))
        db.add(
            WorkspaceMember(
                workspace_id=workspace_id,
                user_id=user.id,
                role=role,
                status=MemberStatus.active,
                joined_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
    return token


async def _seed_customer(client, workspace_id, name="Acme Corp") -> int:
    async with client.session_maker() as db:
        customer = Customer(workspace_id=workspace_id, name=name)
        db.add(customer)
        await db.commit()
        await db.refresh(customer)
        return customer.id


async def _seed_shipments(client, workspace_id, user_id, n):
    async with client.session_maker() as db:
        for i in range(n):
            db.add(
                Shipment(
                    workspace_id=workspace_id,
                    created_by=user_id,
                    freight_mode=FreightMode.FCL,
                    currency="USD",
                    cargo_description=f"Cargo {i}",
                    shipment_date=date(2026, 1, 1),
                )
            )
        await db.commit()


async def test_list_shipments_defaults_to_50_and_reports_total(client):
    token = await _register(client, "owner1@example.com")
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _seed_shipments(client, workspace_id, me.json()["id"], 75)

    resp = await client.get("/shipments", headers={"Authorization": f"Bearer {token}"})
    body = resp.json()
    assert body["total"] == 75
    assert len(body["items"]) == 50


async def test_list_shipments_paginates_without_gaps_or_duplicates(client):
    token = await _register(client, "owner2@example.com")
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _seed_shipments(client, workspace_id, me.json()["id"], 120)
    headers = {"Authorization": f"Bearer {token}"}

    seen_ids = set()
    offset = 0
    while True:
        resp = await client.get(f"/shipments?limit=50&offset={offset}", headers=headers)
        items = resp.json()["items"]
        if not items:
            break
        for item in items:
            assert item["id"] not in seen_ids, "pagination returned a duplicate row"
            seen_ids.add(item["id"])
        offset += 50

    assert len(seen_ids) == 120


async def test_list_shipments_respects_limit_param(client):
    token = await _register(client, "owner3@example.com")
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _seed_shipments(client, workspace_id, me.json()["id"], 10)

    resp = await client.get("/shipments?limit=3", headers={"Authorization": f"Bearer {token}"})
    body = resp.json()
    assert body["total"] == 10
    assert len(body["items"]) == 3


async def test_list_shipments_rejects_limit_over_200(client):
    token = await _register(client, "owner4@example.com")
    resp = await client.get("/shipments?limit=500", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


async def _seed_shipment(
    client,
    workspace_id,
    user_id,
    *,
    customer_id=None,
    status_=ShipmentStatus.inquiry,
    freight_cost=None,
    cargo_description=None,
    origin_port=None,
    destination_port=None,
    container_no=None,
    shipment_date_=date(2026, 1, 1),
):
    async with client.session_maker() as db:
        shipment = Shipment(
            workspace_id=workspace_id,
            created_by=user_id,
            customer_id=customer_id,
            freight_mode=FreightMode.FCL,
            currency="USD",
            status=status_,
            freight_cost=Decimal(str(freight_cost)) if freight_cost is not None else None,
            cargo_description=cargo_description,
            origin_port=origin_port,
            destination_port=destination_port,
            container_no=container_no,
            shipment_date=shipment_date_,
        )
        db.add(shipment)
        await db.commit()
        await db.refresh(shipment)
        return shipment.id


async def test_list_shipments_search_matches_customer_name(client):
    token = await _register(client, "search1@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    acme_id = await _seed_customer(client, workspace_id, "Acme Import Co.")
    globex_id = await _seed_customer(client, workspace_id, "Globex Trading")
    await _seed_shipment(client, workspace_id, me.json()["id"], customer_id=acme_id)
    await _seed_shipment(client, workspace_id, me.json()["id"], customer_id=globex_id)

    resp = await client.get("/shipments?q=acme", headers=headers)
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["customer_name"] == "Acme Import Co."


async def test_list_shipments_search_matches_cargo_and_ports(client):
    token = await _register(client, "search2@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    await _seed_shipment(
        client, workspace_id, me.json()["id"], cargo_description="Solar panels", origin_port="Qingdao, CN"
    )
    await _seed_shipment(
        client, workspace_id, me.json()["id"], cargo_description="Machinery parts", origin_port="Yantian, CN"
    )

    resp = await client.get("/shipments?q=solar", headers=headers)
    assert resp.json()["total"] == 1

    resp = await client.get("/shipments?q=yantian", headers=headers)
    assert resp.json()["total"] == 1


async def test_list_shipments_filters_by_status(client):
    token = await _register(client, "filter1@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    await _seed_shipment(client, workspace_id, me.json()["id"], status_=ShipmentStatus.booked)
    await _seed_shipment(client, workspace_id, me.json()["id"], status_=ShipmentStatus.delivered)
    await _seed_shipment(client, workspace_id, me.json()["id"], status_=ShipmentStatus.cancelled)

    resp = await client.get("/shipments?status=booked&status=delivered", headers=headers)
    body = resp.json()
    assert body["total"] == 2
    assert {item["status"] for item in body["items"]} == {"booked", "delivered"}


async def test_list_shipments_rejects_invalid_status_filter(client):
    token = await _register(client, "filter2@example.com")
    resp = await client.get("/shipments?status=not-a-status", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


async def test_list_shipments_sorts_by_cost_ascending(client):
    token = await _register(client, "sort1@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    await _seed_shipment(client, workspace_id, me.json()["id"], freight_cost=500)
    await _seed_shipment(client, workspace_id, me.json()["id"], freight_cost=100)
    await _seed_shipment(client, workspace_id, me.json()["id"], freight_cost=300)

    resp = await client.get("/shipments?sort_by=cost&sort_dir=asc", headers=headers)
    costs = [item["freight_cost"] for item in resp.json()["items"]]
    assert costs == [100, 300, 500]


async def test_list_shipments_sorts_by_customer_name(client):
    token = await _register(client, "sort2@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    me = await client.get("/auth/me", headers=headers)
    z_id = await _seed_customer(client, workspace_id, "Zebra Logistics")
    a_id = await _seed_customer(client, workspace_id, "Alpha Freight")
    await _seed_shipment(client, workspace_id, me.json()["id"], customer_id=z_id)
    await _seed_shipment(client, workspace_id, me.json()["id"], customer_id=a_id)

    resp = await client.get("/shipments?sort_by=customer&sort_dir=asc", headers=headers)
    names = [item["customer_name"] for item in resp.json()["items"]]
    assert names == ["Alpha Freight", "Zebra Logistics"]


async def test_list_shipments_rejects_invalid_sort_by(client):
    token = await _register(client, "sort3@example.com")
    resp = await client.get("/shipments?sort_by=not-a-column", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


async def test_create_shipment_without_a_document(client):
    token = await _register(client, "manual-owner@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    customer_id = await _seed_customer(client, workspace_id)

    resp = await client.post(
        "/shipments",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "LCL",
            "origin_port": "Manual Entry Port",
            "destination_port": "Manual Destination",
            "cargo_description": "Phone-booked shipment, no paperwork yet",
            "currency": "USD",
            "shipment_date": "2026-08-20",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["customer_name"] == "Acme Corp"
    assert body["document_file_url"] is None
    assert body["status"] == "inquiry"

    async with client.session_maker() as db:
        shipment = await db.get(Shipment, body["id"])
    assert shipment.document_id is None


async def test_viewer_cannot_create_shipment(client):
    owner_token = await _register(client, "manual-owner2@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    customer_id = await _seed_customer(client, workspace_id)
    viewer_token = await _add_member(client, workspace_id, "manual-viewer2@example.com", WorkspaceRole.viewer)

    resp = await client.post(
        f"/shipments?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={
            "customer_id": customer_id,
            "freight_mode": "LCL",
            "currency": "USD",
            "shipment_date": "2026-08-20",
        },
    )
    assert resp.status_code == 403


async def test_owner_can_generate_mock_data(client):
    token = await _register(client, "owner5@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    await _seed_customer(client, workspace_id)

    resp = await client.post("/shipments/mock-data?count=25", headers=headers)
    assert resp.status_code == 201
    assert resp.json()["created"] == 25

    list_resp = await client.get("/shipments", headers=headers)
    assert list_resp.json()["total"] == 25


async def test_mock_data_shipments_have_no_document(client):
    token = await _register(client, "owner6@example.com")
    workspace_id = await _workspace_id(client, token)
    await _seed_customer(client, workspace_id)
    await client.post("/shipments/mock-data?count=5", headers={"Authorization": f"Bearer {token}"})

    async with client.session_maker() as db:
        rows = (await db.scalars(select(Shipment).where(Shipment.workspace_id == workspace_id))).all()
    assert len(rows) == 5
    assert all(r.document_id is None for r in rows)


async def test_mock_data_400s_when_workspace_has_no_customers(client):
    token = await _register(client, "owner6b@example.com")
    resp = await client.post("/shipments/mock-data?count=5", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


async def test_editor_cannot_generate_mock_data(client):
    owner_token = await _register(client, "owner7@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    editor_token = await _add_member(client, workspace_id, "editor7@example.com", WorkspaceRole.editor)

    resp = await client.post(
        f"/shipments/mock-data?workspace_id={workspace_id}&count=5",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    assert resp.status_code == 403


async def test_viewer_cannot_generate_mock_data(client):
    owner_token = await _register(client, "owner8@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    viewer_token = await _add_member(client, workspace_id, "viewer8@example.com", WorkspaceRole.viewer)

    resp = await client.post(
        f"/shipments/mock-data?workspace_id={workspace_id}&count=5",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


async def test_mock_data_count_is_capped(client):
    token = await _register(client, "owner9@example.com")
    resp = await client.post("/shipments/mock-data?count=20001", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


async def _create_shipment(client, headers, workspace_id) -> int:
    """Confirm a document into a shipment via the real flow so its id is
    reachable through the /shipments/{id} detail endpoints below."""
    customer_id = await _seed_customer(client, workspace_id)

    with (
        patch("app.routers.documents.upload_document_file", return_value="https://example.com/doc.png"),
        patch(
            "app.routers.documents.extract_document_fields",
            return_value=(
                {
                    "doc_type": None,
                    "bl_number": None,
                    "shipper": None,
                    "consignee": None,
                    "origin_port": None,
                    "destination_port": None,
                    "cargo_description": None,
                    "weight_kg": None,
                },
                True,
            ),
        ),
    ):
        upload_resp = await client.post(
            "/documents/upload",
            headers=headers,
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )
    document_id = upload_resp.json()["id"]

    confirm_resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    return confirm_resp.json()["id"]


async def test_get_shipment_detail_includes_empty_quotes_and_tracking_events(client):
    token = await _register(client, "owner10@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    shipment_id = await _create_shipment(client, headers, workspace_id)

    resp = await client.get(f"/shipments/{shipment_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == shipment_id
    assert body["quotes"] == []
    assert body["tracking_events"] == []


async def test_get_shipment_detail_404s_for_unknown_shipment(client):
    token = await _register(client, "owner11@example.com")
    resp = await client.get("/shipments/999999", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


async def test_update_shipment_status(client):
    token = await _register(client, "owner12@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    shipment_id = await _create_shipment(client, headers, workspace_id)

    resp = await client.patch(f"/shipments/{shipment_id}/status", headers=headers, json={"status": "booked"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "booked"


async def test_viewer_cannot_update_shipment_status(client):
    owner_token = await _register(client, "owner13@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    workspace_id = await _workspace_id(client, owner_token)
    shipment_id = await _create_shipment(client, owner_headers, workspace_id)
    viewer_token = await _add_member(client, workspace_id, "viewer13@example.com", WorkspaceRole.viewer)

    resp = await client.patch(
        f"/shipments/{shipment_id}/status?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"status": "booked"},
    )
    assert resp.status_code == 403


async def test_add_tracking_event_also_updates_shipment_status(client):
    token = await _register(client, "owner14@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    shipment_id = await _create_shipment(client, headers, workspace_id)

    resp = await client.post(
        f"/shipments/{shipment_id}/tracking-events",
        headers=headers,
        json={"status": "in_transit", "location": "Port of Los Angeles", "event_date": "2026-08-10"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "in_transit"

    detail_resp = await client.get(f"/shipments/{shipment_id}", headers=headers)
    assert detail_resp.json()["status"] == "in_transit"
    assert len(detail_resp.json()["tracking_events"]) == 1


async def test_add_quote_rejects_unknown_carrier(client):
    token = await _register(client, "owner15@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    shipment_id = await _create_shipment(client, headers, workspace_id)

    resp = await client.post(
        f"/shipments/{shipment_id}/quotes",
        headers=headers,
        json={"carrier_id": 999999, "amount": 100, "currency": "USD"},
    )
    assert resp.status_code == 400


async def test_add_quote_with_known_carrier(client):
    token = await _register(client, "owner16@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    workspace_id = await _workspace_id(client, token)
    shipment_id = await _create_shipment(client, headers, workspace_id)

    carrier_resp = await client.post(
        "/carriers", headers=headers, json={"name": "Ocean Line Co", "mode": "FCL"}
    )
    carrier_id = carrier_resp.json()["id"]

    resp = await client.post(
        f"/shipments/{shipment_id}/quotes",
        headers=headers,
        json={"carrier_id": carrier_id, "amount": 4200.50, "currency": "USD"},
    )
    assert resp.status_code == 201
    assert resp.json()["carrier_name"] == "Ocean Line Co"
    assert resp.json()["status"] == "pending"
