from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import select

from app.models import Customer, MemberStatus, User, WorkspaceMember, WorkspaceRole

FAKE_IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/fake.png"
FAKE_EXTRACTION = {
    "doc_type": "bill_of_lading",
    "bl_number": "BL123456",
    "shipper": "Acme Shippers",
    "consignee": "Acme Consignee",
    "origin_port": "Shanghai, CN",
    "destination_port": "Los Angeles, US",
    "cargo_description": "Electronics components",
    "weight_kg": 1200.5,
}


def _mocks():
    return (
        patch("app.routers.documents.upload_document_file", return_value=FAKE_IMAGE_URL),
        patch("app.routers.documents.extract_document_fields", return_value=dict(FAKE_EXTRACTION)),
    )


async def _register(client, email):
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _add_member(client, workspace_id, email, role) -> str:
    """Register a second user (which auto-creates their own personal workspace, same as
    any real signup) and then seed their membership on `workspace_id` directly via the
    DB — there's no invite-accept API used here (that flow is covered in test_invites.py).
    Because the user has their own personal workspace too, tests must pass `workspace_id`
    explicitly to reach the shared one rather than relying on the no-workspace_id default."""
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


async def _seed_customer(client, workspace_id) -> int:
    async with client.session_maker() as db:
        customer = Customer(workspace_id=workspace_id, name="Acme Corp")
        db.add(customer)
        await db.commit()
        await db.refresh(customer)
        return customer.id


async def test_list_workspaces_returns_personal_workspace_with_owner_role(client):
    token = await _register(client, "owner1@example.com")
    resp = await client.get("/workspaces", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    workspaces = resp.json()
    assert len(workspaces) == 1
    assert workspaces[0]["name"] == "My Freight Team"
    assert workspaces[0]["role"] == "owner"


async def test_list_workspaces_includes_workspaces_user_is_a_member_of(client):
    owner_token = await _register(client, "owner2@example.com")
    workspace_id = (await client.get("/workspaces", headers={"Authorization": f"Bearer {owner_token}"})).json()[0][
        "id"
    ]

    viewer_token = await _add_member(client, workspace_id, "viewer2@example.com", WorkspaceRole.viewer)
    resp = await client.get("/workspaces", headers={"Authorization": f"Bearer {viewer_token}"})
    assert resp.status_code == 200
    workspaces = resp.json()
    # the viewer sees both their own personal workspace (owner) and the shared one (viewer)
    assert len(workspaces) == 2
    shared = next(w for w in workspaces if w["id"] == workspace_id)
    assert shared["role"] == "viewer"


async def test_viewer_cannot_upload_document(client):
    owner_token = await _register(client, "owner3@example.com")
    workspace_id = (await client.get("/workspaces", headers={"Authorization": f"Bearer {owner_token}"})).json()[0][
        "id"
    ]
    viewer_token = await _add_member(client, workspace_id, "viewer3@example.com", WorkspaceRole.viewer)

    resp = await client.post(
        "/documents/upload",
        headers={"Authorization": f"Bearer {viewer_token}"},
        data={"workspace_id": str(workspace_id)},
        files={"file": ("document.png", b"fake-image-bytes", "image/png")},
    )
    assert resp.status_code == 403


async def test_viewer_can_list_shipments(client):
    owner_token = await _register(client, "owner4@example.com")
    workspace_id = (await client.get("/workspaces", headers={"Authorization": f"Bearer {owner_token}"})).json()[0][
        "id"
    ]
    viewer_token = await _add_member(client, workspace_id, "viewer4@example.com", WorkspaceRole.viewer)

    resp = await client.get(
        f"/shipments?workspace_id={workspace_id}", headers={"Authorization": f"Bearer {viewer_token}"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0}


async def test_viewer_cannot_confirm_document(client):
    owner_token = await _register(client, "owner5@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    workspace_id = (await client.get("/workspaces", headers=owner_headers)).json()[0]["id"]

    upload_mock, extract_mock = _mocks()
    with upload_mock, extract_mock:
        upload_resp = await client.post(
            "/documents/upload",
            headers=owner_headers,
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )
    document_id = upload_resp.json()["id"]

    viewer_token = await _add_member(client, workspace_id, "viewer5@example.com", WorkspaceRole.viewer)
    resp = await client.post(
        f"/documents/{document_id}/confirm?workspace_id={workspace_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={
            "customer_id": 1,
            "freight_mode": "FCL",
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert resp.status_code == 403


async def test_editor_can_upload_and_confirm_document_on_a_shared_workspace(client):
    owner_token = await _register(client, "owner6@example.com")
    workspace_id = (await client.get("/workspaces", headers={"Authorization": f"Bearer {owner_token}"})).json()[0][
        "id"
    ]
    editor_token = await _add_member(client, workspace_id, "editor6@example.com", WorkspaceRole.editor)
    editor_headers = {"Authorization": f"Bearer {editor_token}"}
    customer_id = await _seed_customer(client, workspace_id)

    upload_mock, extract_mock = _mocks()
    with upload_mock, extract_mock:
        upload_resp = await client.post(
            "/documents/upload",
            headers=editor_headers,
            data={"workspace_id": str(workspace_id)},
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )
    assert upload_resp.status_code == 201
    document_id = upload_resp.json()["id"]

    confirm_resp = await client.post(
        f"/documents/{document_id}/confirm?workspace_id={workspace_id}",
        headers=editor_headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert confirm_resp.status_code == 201

    list_resp = await client.get(f"/shipments?workspace_id={workspace_id}", headers=editor_headers)
    assert list_resp.json()["total"] == 1


async def test_upload_404s_for_workspace_caller_is_not_a_member_of(client):
    await _register(client, "owner7@example.com")
    other_token = await _register(client, "other7@example.com")
    other_workspace_id = (await client.get("/workspaces", headers={"Authorization": f"Bearer {other_token}"})).json()[
        0
    ]["id"]

    # other7's own workspace is a different id than owner7's — pick one that's definitely not other7's
    not_a_member_workspace_id = other_workspace_id + 1000

    resp = await client.post(
        "/documents/upload",
        headers={"Authorization": f"Bearer {other_token}"},
        data={"workspace_id": str(not_a_member_workspace_id)},
        files={"file": ("document.png", b"fake-image-bytes", "image/png")},
    )
    assert resp.status_code == 404


async def test_list_shipments_404s_for_workspace_caller_is_not_a_member_of(client):
    owner_token = await _register(client, "owner8@example.com")
    workspace_id = (await client.get("/workspaces", headers={"Authorization": f"Bearer {owner_token}"})).json()[0][
        "id"
    ]
    outsider_token = await _register(client, "outsider8@example.com")

    resp = await client.get(
        f"/shipments?workspace_id={workspace_id}", headers={"Authorization": f"Bearer {outsider_token}"}
    )
    assert resp.status_code == 404
