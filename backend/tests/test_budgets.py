from datetime import datetime, timezone

from sqlalchemy import select

from app.models import LedgerMember, LedgerRole, MemberStatus, User


async def _register(client, email) -> str:
    resp = await client.post("/auth/register", json={"email": email, "password": "testpassword123"})
    return resp.json()["access_token"]


async def _ledger_id(client, token) -> int:
    resp = await client.get("/ledgers", headers={"Authorization": f"Bearer {token}"})
    return resp.json()[0]["id"]


async def _add_member(client, ledger_id, email, role) -> str:
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


async def test_owner_can_set_and_list_a_budget(client):
    token = await _register(client, "owner1@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.put(
        "/budgets", headers=headers, json={"category": "Food", "month": "2026-08", "planned_amount": 300}
    )
    assert resp.status_code == 200
    assert resp.json()["category"] == "Food"
    assert resp.json()["planned_amount"] == 300.0

    list_resp = await client.get("/budgets?month=2026-08", headers=headers)
    assert list_resp.status_code == 200
    budgets = list_resp.json()
    assert len(budgets) == 1
    assert budgets[0]["planned_amount"] == 300.0


async def test_upsert_budget_updates_existing_row_instead_of_duplicating(client):
    token = await _register(client, "owner2@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    await client.put("/budgets", headers=headers, json={"category": "Food", "month": "2026-08", "planned_amount": 300})
    resp = await client.put(
        "/budgets", headers=headers, json={"category": "Food", "month": "2026-08", "planned_amount": 450}
    )
    assert resp.status_code == 200
    assert resp.json()["planned_amount"] == 450.0

    list_resp = await client.get("/budgets?month=2026-08", headers=headers)
    budgets = list_resp.json()
    assert len(budgets) == 1
    assert budgets[0]["planned_amount"] == 450.0


async def test_viewer_cannot_set_a_budget(client):
    owner_token = await _register(client, "owner3@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    viewer_token = await _add_member(client, ledger_id, "viewer3@example.com", LedgerRole.viewer)

    resp = await client.put(
        f"/budgets?ledger_id={ledger_id}",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"category": "Food", "month": "2026-08", "planned_amount": 300},
    )
    assert resp.status_code == 403


async def test_viewer_can_list_budgets(client):
    owner_token = await _register(client, "owner4@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    await client.put(
        f"/budgets?ledger_id={ledger_id}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"category": "Food", "month": "2026-08", "planned_amount": 300},
    )
    viewer_token = await _add_member(client, ledger_id, "viewer4@example.com", LedgerRole.viewer)

    resp = await client.get(f"/budgets?ledger_id={ledger_id}&month=2026-08", headers={"Authorization": f"Bearer {viewer_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_list_budgets_requires_month_param(client):
    token = await _register(client, "owner5@example.com")
    resp = await client.get("/budgets", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


async def test_list_budgets_rejects_malformed_month(client):
    token = await _register(client, "owner6@example.com")
    resp = await client.get("/budgets?month=not-a-month", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


async def test_set_budget_rejects_malformed_month(client):
    token = await _register(client, "owner7@example.com")
    resp = await client.put(
        "/budgets",
        headers={"Authorization": f"Bearer {token}"},
        json={"category": "Food", "month": "2026-8", "planned_amount": 300},
    )
    assert resp.status_code == 422


async def test_set_budget_rejects_zero_or_negative_amount(client):
    token = await _register(client, "owner8@example.com")
    resp = await client.put(
        "/budgets",
        headers={"Authorization": f"Bearer {token}"},
        json={"category": "Food", "month": "2026-08", "planned_amount": 0},
    )
    assert resp.status_code == 422


async def test_budgets_404_for_ledger_caller_is_not_a_member_of(client):
    owner_token = await _register(client, "owner9@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    outsider_token = await _register(client, "outsider9@example.com")

    resp = await client.get(
        f"/budgets?ledger_id={ledger_id}&month=2026-08", headers={"Authorization": f"Bearer {outsider_token}"}
    )
    assert resp.status_code == 404
