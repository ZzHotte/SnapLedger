from datetime import datetime, timezone

from sqlalchemy import select

from app.models import MemberStatus, User, WorkspaceMember, WorkspaceRole


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


async def test_create_and_list_customers(client):
    token = await _register(client, "owner1@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = await client.post(
        "/customers",
        headers=headers,
        json={"name": "Acme Corp", "contact_name": "Jane Doe", "contact_email": "jane@acme.com"},
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["name"] == "Acme Corp"

    list_resp = await client.get("/customers", headers=headers)
    assert list_resp.status_code == 200
    names = [c["name"] for c in list_resp.json()]
    assert names == ["Acme Corp"]


async def test_get_customer_returns_details(client):
    token = await _register(client, "owner9@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    create_resp = await client.post(
        "/customers",
        headers=headers,
        json={"name": "Acme Corp", "contact_name": "Jane Doe", "contact_email": "jane@acme.com"},
    )
    customer_id = create_resp.json()["id"]

    resp = await client.get(f"/customers/{customer_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == create_resp.json()


async def test_get_customer_404s_for_unknown_id(client):
    token = await _register(client, "owner10@example.com")
    resp = await client.get("/customers/999999", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


async def test_get_customer_404s_for_customer_in_another_workspace(client):
    owner_a_token = await _register(client, "owner11@example.com")
    create_resp = await client.post(
        "/customers", headers={"Authorization": f"Bearer {owner_a_token}"}, json={"name": "Acme Corp"}
    )
    customer_id = create_resp.json()["id"]

    owner_b_token = await _register(client, "owner12@example.com")
    resp = await client.get(f"/customers/{customer_id}", headers={"Authorization": f"Bearer {owner_b_token}"})
    assert resp.status_code == 404


async def test_reorder_customers_persists_order(client):
    token = await _register(client, "owner6@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    ids = []
    for name in ("Acme Corp", "Bravo Ltd", "Charlie Inc"):
        resp = await client.post("/customers", headers=headers, json={"name": name})
        ids.append(resp.json()["id"])

    # Default order is alphabetical, so this is a real reshuffle.
    new_order = [ids[2], ids[0], ids[1]]
    reorder_resp = await client.patch("/customers/reorder", headers=headers, json={"customer_ids": new_order})
    assert reorder_resp.status_code == 204

    list_resp = await client.get("/customers", headers=headers)
    assert [c["id"] for c in list_resp.json()] == new_order


async def test_reorder_customers_rejects_mismatched_ids(client):
    token = await _register(client, "owner7@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = await client.post("/customers", headers=headers, json={"name": "Acme Corp"})
    real_id = create_resp.json()["id"]

    resp = await client.patch(
        "/customers/reorder", headers=headers, json={"customer_ids": [real_id, real_id + 999]}
    )
    assert resp.status_code == 400


async def test_viewer_cannot_reorder_customers(client):
    owner_token = await _register(client, "owner8@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    create_resp = await client.post(
        f"/customers?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Acme Corp"},
    )
    customer_id = create_resp.json()["id"]
    viewer_token = await _add_member(client, workspace_id, "viewer8@example.com", WorkspaceRole.viewer)

    resp = await client.patch(
        f"/customers/reorder?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"customer_ids": [customer_id]},
    )
    assert resp.status_code == 403


async def test_viewer_cannot_create_customer(client):
    owner_token = await _register(client, "owner2@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    viewer_token = await _add_member(client, workspace_id, "viewer2@example.com", WorkspaceRole.viewer)

    resp = await client.post(
        f"/customers?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"name": "Acme Corp"},
    )
    assert resp.status_code == 403


async def test_create_and_list_carriers(client):
    token = await _register(client, "owner3@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = await client.post(
        "/carriers", headers=headers, json={"name": "Ocean Line Co", "mode": "FCL", "contact_email": "ops@ocean.com"}
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["mode"] == "FCL"

    list_resp = await client.get("/carriers", headers=headers)
    assert list_resp.status_code == 200
    names = [c["name"] for c in list_resp.json()]
    assert names == ["Ocean Line Co"]


async def test_viewer_cannot_create_carrier(client):
    owner_token = await _register(client, "owner4@example.com")
    workspace_id = await _workspace_id(client, owner_token)
    viewer_token = await _add_member(client, workspace_id, "viewer4@example.com", WorkspaceRole.viewer)

    resp = await client.post(
        f"/carriers?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"name": "Ocean Line Co", "mode": "FCL"},
    )
    assert resp.status_code == 403


async def test_create_carrier_rejects_invalid_mode(client):
    token = await _register(client, "owner5@example.com")
    resp = await client.post(
        "/carriers",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Ocean Line Co", "mode": "TRUCK"},
    )
    assert resp.status_code == 422
