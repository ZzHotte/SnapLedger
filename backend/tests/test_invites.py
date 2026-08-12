from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import LedgerInvite, LedgerMember, LedgerRole, MemberStatus, User


async def _register(client, email) -> str:
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _ledger_id(client, token) -> int:
    resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {token}"})
    return resp.json()[0]["id"]


async def _add_member(client, ledger_id, email, role) -> tuple[str, int]:
    """Seed a member directly via the DB (bypassing the invite flow) for tests whose
    focus is elsewhere — mirrors the helper in test_ledgers_api.py."""
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
        user_id = user.id
    return token, user_id


async def test_owner_can_invite_and_another_user_can_accept(client):
    owner_token = await _register(client, "owner1@example.com")
    ledger_id = await _ledger_id(client, owner_token)

    invite_resp = await client.post(
        f"/ledgers/{ledger_id}/invites",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "editor"},
    )
    assert invite_resp.status_code == 201
    invite = invite_resp.json()
    assert invite["role"] == "editor"

    joiner_token = await _register(client, "joiner1@example.com")
    accept_resp = await client.post(
        f"/ledgers/invites/{invite['invite_code']}/accept",
        headers={"Authorization": f"Bearer {joiner_token}"},
    )
    assert accept_resp.status_code == 200
    body = accept_resp.json()
    assert body["ledger_id"] == ledger_id
    assert body["role"] == "editor"

    ledgers_resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {joiner_token}"})
    shared = next(led for led in ledgers_resp.json() if led["id"] == ledger_id)
    assert shared["role"] == "editor"

    members_resp = await client.get(f"/ledgers/{ledger_id}/members", headers={"Authorization": f"Bearer {owner_token}"})
    assert members_resp.status_code == 200
    roles = {m["email"]: m["role"] for m in members_resp.json()}
    assert roles == {"owner1@example.com": "owner", "joiner1@example.com": "editor"}


async def test_non_owner_cannot_create_invite(client):
    owner_token = await _register(client, "owner2@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    editor_token, _ = await _add_member(client, ledger_id, "editor2@example.com", LedgerRole.editor)

    resp = await client.post(
        f"/ledgers/{ledger_id}/invites",
        headers={"Authorization": f"Bearer {editor_token}"},
        json={"role": "viewer"},
    )
    assert resp.status_code == 403


async def test_accept_unknown_invite_code_404s(client):
    token = await _register(client, "user3@example.com")
    resp = await client.post(
        "/ledgers/invites/does-not-exist/accept", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


async def test_accept_already_used_invite_409s(client):
    owner_token = await _register(client, "owner4@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    invite_resp = await client.post(
        f"/ledgers/{ledger_id}/invites",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "viewer"},
    )
    code = invite_resp.json()["invite_code"]

    first_token = await _register(client, "first4@example.com")
    await client.post(f"/ledgers/invites/{code}/accept", headers={"Authorization": f"Bearer {first_token}"})

    second_token = await _register(client, "second4@example.com")
    resp = await client.post(f"/ledgers/invites/{code}/accept", headers={"Authorization": f"Bearer {second_token}"})
    assert resp.status_code == 409


async def test_accept_expired_invite_409s(client):
    owner_token = await _register(client, "owner5@example.com")
    ledger_id = await _ledger_id(client, owner_token)

    async with client.session_maker() as db:
        owner = await db.scalar(select(User).where(User.email == "owner5@example.com"))
        db.add(
            LedgerInvite(
                ledger_id=ledger_id,
                invite_code="expired-code-5",
                role=LedgerRole.viewer,
                created_by=owner.id,
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        await db.commit()

    joiner_token = await _register(client, "joiner5@example.com")
    resp = await client.post(
        "/ledgers/invites/expired-code-5/accept", headers={"Authorization": f"Bearer {joiner_token}"}
    )
    assert resp.status_code == 409


async def test_accept_invite_when_already_a_member_409s(client):
    owner_token = await _register(client, "owner6@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    member_token, _ = await _add_member(client, ledger_id, "member6@example.com", LedgerRole.viewer)

    invite_resp = await client.post(
        f"/ledgers/{ledger_id}/invites",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "editor"},
    )
    code = invite_resp.json()["invite_code"]

    resp = await client.post(f"/ledgers/invites/{code}/accept", headers={"Authorization": f"Bearer {member_token}"})
    assert resp.status_code == 409


async def test_create_invite_409s_when_ledger_is_full(client):
    owner_token = await _register(client, "owner7@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    for i in range(4):
        await _add_member(client, ledger_id, f"filler7-{i}@example.com", LedgerRole.viewer)

    resp = await client.post(
        f"/ledgers/{ledger_id}/invites",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "viewer"},
    )
    assert resp.status_code == 409


async def test_accept_invite_409s_when_ledger_is_full(client):
    owner_token = await _register(client, "owner8@example.com")
    ledger_id = await _ledger_id(client, owner_token)

    invite_resp = await client.post(
        f"/ledgers/{ledger_id}/invites",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "viewer"},
    )
    code = invite_resp.json()["invite_code"]

    for i in range(4):
        await _add_member(client, ledger_id, f"filler8-{i}@example.com", LedgerRole.viewer)

    joiner_token = await _register(client, "joiner8@example.com")
    resp = await client.post(f"/ledgers/invites/{code}/accept", headers={"Authorization": f"Bearer {joiner_token}"})
    assert resp.status_code == 409


async def test_owner_can_update_member_role(client):
    owner_token = await _register(client, "owner9@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    _, member_id = await _add_member(client, ledger_id, "member9@example.com", LedgerRole.viewer)

    resp = await client.patch(
        f"/ledgers/{ledger_id}/members/{member_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "editor"},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "editor"


async def test_non_owner_cannot_update_member_role(client):
    owner_token = await _register(client, "owner10@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    editor_token, _ = await _add_member(client, ledger_id, "editor10@example.com", LedgerRole.editor)
    _, other_id = await _add_member(client, ledger_id, "other10@example.com", LedgerRole.viewer)

    resp = await client.patch(
        f"/ledgers/{ledger_id}/members/{other_id}",
        headers={"Authorization": f"Bearer {editor_token}"},
        json={"role": "editor"},
    )
    assert resp.status_code == 403


async def test_owner_cannot_change_their_own_role(client):
    owner_token = await _register(client, "owner11@example.com")
    ledger_id = await _ledger_id(client, owner_token)

    me_resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    owner_id = me_resp.json()["id"]

    resp = await client.patch(
        f"/ledgers/{ledger_id}/members/{owner_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"role": "editor"},
    )
    assert resp.status_code == 400


async def test_owner_can_remove_another_member(client):
    owner_token = await _register(client, "owner12@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    _, member_id = await _add_member(client, ledger_id, "member12@example.com", LedgerRole.viewer)

    resp = await client.delete(
        f"/ledgers/{ledger_id}/members/{member_id}", headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert resp.status_code == 204

    members_resp = await client.get(f"/ledgers/{ledger_id}/members", headers={"Authorization": f"Bearer {owner_token}"})
    assert all(m["user_id"] != member_id for m in members_resp.json())


async def test_member_can_leave_ledger(client):
    owner_token = await _register(client, "owner13@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    member_token, member_id = await _add_member(client, ledger_id, "member13@example.com", LedgerRole.editor)

    resp = await client.delete(
        f"/ledgers/{ledger_id}/members/{member_id}", headers={"Authorization": f"Bearer {member_token}"}
    )
    assert resp.status_code == 204

    ledgers_resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {member_token}"})
    assert all(led["id"] != ledger_id for led in ledgers_resp.json())


async def test_owner_cannot_leave_their_own_ledger(client):
    owner_token = await _register(client, "owner14@example.com")
    ledger_id = await _ledger_id(client, owner_token)

    me_resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {owner_token}"})
    owner_id = me_resp.json()["id"]

    resp = await client.delete(
        f"/ledgers/{ledger_id}/members/{owner_id}", headers={"Authorization": f"Bearer {owner_token}"}
    )
    assert resp.status_code == 400


async def test_non_owner_cannot_remove_another_member(client):
    owner_token = await _register(client, "owner15@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    editor_token, _ = await _add_member(client, ledger_id, "editor15@example.com", LedgerRole.editor)
    _, other_id = await _add_member(client, ledger_id, "other15@example.com", LedgerRole.viewer)

    resp = await client.delete(
        f"/ledgers/{ledger_id}/members/{other_id}", headers={"Authorization": f"Bearer {editor_token}"}
    )
    assert resp.status_code == 403
