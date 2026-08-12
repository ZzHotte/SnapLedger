from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import select

from app.models import LedgerMember, LedgerRole, MemberStatus, User

FAKE_IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/fake.png"
FAKE_EXTRACTION = {
    "merchant": "COFFEE CORNER",
    "transaction_date": "2026-08-01",
    "amount": 12.5,
    "currency": "USD",
    "category": "Food",
}


def _mocks():
    return (
        patch("app.routers.receipts.upload_receipt_image", return_value=FAKE_IMAGE_URL),
        patch("app.routers.receipts.extract_receipt_fields", return_value=dict(FAKE_EXTRACTION)),
    )


async def _register(client, email):
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _add_member(client, ledger_id, email, role) -> str:
    """Register a second user (which auto-creates their own personal ledger, same as
    any real signup) and then seed their membership on `ledger_id` directly via the
    DB — there's no invite-accept API yet (that's Week 4). Because the user has their
    own personal ledger too, tests must pass `ledger_id` explicitly to reach the
    shared one rather than relying on the no-ledger_id default."""
    token = await _register(client, email)

    async with client.session_maker() as db:
        user = await db.scalar(select(User).where(User.email == email))
        db.add(
            LedgerMember(
                ledger_id=ledger_id,
                user_id=user.id,
                role=role,
                status=MemberStatus.active,
                joined_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()

    return token


async def test_list_ledgers_returns_personal_ledger_with_owner_role(client):
    token = await _register(client, "owner1@example.com")
    resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    ledgers = resp.json()
    assert len(ledgers) == 1
    assert ledgers[0]["name"] == "Personal"
    assert ledgers[0]["role"] == "owner"


async def test_list_ledgers_includes_ledgers_user_is_a_member_of(client):
    owner_token = await _register(client, "owner2@example.com")
    ledger_id = (await client.get("/ledgers", headers={"Authorization": f"Bearer {owner_token}"})).json()[0]["id"]

    viewer_token = await _add_member(client, ledger_id, "viewer2@example.com", LedgerRole.viewer)
    resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {viewer_token}"})
    assert resp.status_code == 200
    ledgers = resp.json()
    # the viewer sees both their own personal ledger (owner) and the shared one (viewer)
    assert len(ledgers) == 2
    shared = next(led for led in ledgers if led["id"] == ledger_id)
    assert shared["role"] == "viewer"


async def test_viewer_cannot_upload_receipt(client):
    owner_token = await _register(client, "owner3@example.com")
    ledger_id = (await client.get("/ledgers", headers={"Authorization": f"Bearer {owner_token}"})).json()[0]["id"]
    viewer_token = await _add_member(client, ledger_id, "viewer3@example.com", LedgerRole.viewer)

    resp = await client.post(
        "/receipts/upload",
        headers={"Authorization": f"Bearer {viewer_token}"},
        data={"ledger_id": str(ledger_id)},
        files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
    )
    assert resp.status_code == 403


async def test_viewer_can_list_transactions(client):
    owner_token = await _register(client, "owner4@example.com")
    ledger_id = (await client.get("/ledgers", headers={"Authorization": f"Bearer {owner_token}"})).json()[0]["id"]
    viewer_token = await _add_member(client, ledger_id, "viewer4@example.com", LedgerRole.viewer)

    resp = await client.get(f"/transactions?ledger_id={ledger_id}", headers={"Authorization": f"Bearer {viewer_token}"})
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0}


async def test_viewer_cannot_confirm_receipt(client):
    owner_token = await _register(client, "owner5@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    ledger_id = (await client.get("/ledgers", headers=owner_headers)).json()[0]["id"]

    upload_mock, extract_mock = _mocks()
    with upload_mock, extract_mock:
        upload_resp = await client.post(
            "/receipts/upload",
            headers=owner_headers,
            files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
        )
    receipt_id = upload_resp.json()["id"]

    viewer_token = await _add_member(client, ledger_id, "viewer5@example.com", LedgerRole.viewer)
    resp = await client.post(
        f"/receipts/{receipt_id}/confirm?ledger_id={ledger_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={
            "merchant": "Coffee Corner",
            "transaction_date": "2026-08-01",
            "amount": 12.5,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert resp.status_code == 403


async def test_editor_can_upload_and_confirm_on_a_shared_ledger(client):
    owner_token = await _register(client, "owner6@example.com")
    ledger_id = (await client.get("/ledgers", headers={"Authorization": f"Bearer {owner_token}"})).json()[0]["id"]
    editor_token = await _add_member(client, ledger_id, "editor6@example.com", LedgerRole.editor)
    editor_headers = {"Authorization": f"Bearer {editor_token}"}

    upload_mock, extract_mock = _mocks()
    with upload_mock, extract_mock:
        upload_resp = await client.post(
            "/receipts/upload",
            headers=editor_headers,
            data={"ledger_id": str(ledger_id)},
            files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
        )
    assert upload_resp.status_code == 201
    receipt_id = upload_resp.json()["id"]

    confirm_resp = await client.post(
        f"/receipts/{receipt_id}/confirm?ledger_id={ledger_id}",
        headers=editor_headers,
        json={
            "merchant": "Coffee Corner",
            "transaction_date": "2026-08-01",
            "amount": 12.5,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert confirm_resp.status_code == 201

    list_resp = await client.get(f"/transactions?ledger_id={ledger_id}", headers=editor_headers)
    assert list_resp.json()["total"] == 1


async def test_upload_404s_for_ledger_caller_is_not_a_member_of(client):
    await _register(client, "owner7@example.com")
    other_token = await _register(client, "other7@example.com")
    other_ledger_id = (await client.get("/ledgers", headers={"Authorization": f"Bearer {other_token}"})).json()[0][
        "id"
    ]

    # other7's own ledger is a different id than owner7's — pick one that's definitely not other7's
    not_a_member_ledger_id = other_ledger_id + 1000

    resp = await client.post(
        "/receipts/upload",
        headers={"Authorization": f"Bearer {other_token}"},
        data={"ledger_id": str(not_a_member_ledger_id)},
        files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
    )
    assert resp.status_code == 404


async def test_list_transactions_404s_for_ledger_caller_is_not_a_member_of(client):
    owner_token = await _register(client, "owner8@example.com")
    ledger_id = (await client.get("/ledgers", headers={"Authorization": f"Bearer {owner_token}"})).json()[0]["id"]
    outsider_token = await _register(client, "outsider8@example.com")

    resp = await client.get(f"/transactions?ledger_id={ledger_id}", headers={"Authorization": f"Bearer {outsider_token}"})
    assert resp.status_code == 404
