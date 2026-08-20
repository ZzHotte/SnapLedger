from datetime import date, datetime, timezone
from unittest.mock import patch

from sqlalchemy import select

from app.models import Customer, FreightMode, MemberStatus, Shipment, User, WorkspaceMember, WorkspaceRole


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
            return_value={
                "doc_type": None,
                "bl_number": None,
                "shipper": None,
                "consignee": None,
                "origin_port": None,
                "destination_port": None,
                "cargo_description": None,
                "weight_kg": None,
            },
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
