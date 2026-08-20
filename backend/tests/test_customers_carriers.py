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
