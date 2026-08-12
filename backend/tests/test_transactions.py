from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.models import Category, LedgerMember, LedgerRole, MemberStatus, Transaction, User


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


async def _seed_transactions(client, ledger_id, user_id, n):
    async with client.session_maker() as db:
        category = await db.scalar(select(Category).where(Category.ledger_id == ledger_id, Category.name == "Food"))
        for i in range(n):
            db.add(
                Transaction(
                    ledger_id=ledger_id,
                    created_by=user_id,
                    amount=Decimal("10.00"),
                    currency="USD",
                    category_id=category.id,
                    transaction_date=date(2026, 1, 1),
                    merchant=f"Merchant {i}",
                )
            )
        await db.commit()


async def test_list_transactions_defaults_to_50_and_reports_total(client):
    token = await _register(client, "owner1@example.com")
    ledger_id = await _ledger_id(client, token)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _seed_transactions(client, ledger_id, me.json()["id"], 75)

    resp = await client.get("/transactions", headers={"Authorization": f"Bearer {token}"})
    body = resp.json()
    assert body["total"] == 75
    assert len(body["items"]) == 50


async def test_list_transactions_paginates_without_gaps_or_duplicates(client):
    token = await _register(client, "owner2@example.com")
    ledger_id = await _ledger_id(client, token)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _seed_transactions(client, ledger_id, me.json()["id"], 120)
    headers = {"Authorization": f"Bearer {token}"}

    seen_ids = set()
    offset = 0
    while True:
        resp = await client.get(f"/transactions?limit=50&offset={offset}", headers=headers)
        items = resp.json()["items"]
        if not items:
            break
        for item in items:
            assert item["id"] not in seen_ids, "pagination returned a duplicate row"
            seen_ids.add(item["id"])
        offset += 50

    assert len(seen_ids) == 120


async def test_list_transactions_respects_limit_param(client):
    token = await _register(client, "owner3@example.com")
    ledger_id = await _ledger_id(client, token)
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    await _seed_transactions(client, ledger_id, me.json()["id"], 10)

    resp = await client.get("/transactions?limit=3", headers={"Authorization": f"Bearer {token}"})
    body = resp.json()
    assert body["total"] == 10
    assert len(body["items"]) == 3


async def test_list_transactions_rejects_limit_over_200(client):
    token = await _register(client, "owner4@example.com")
    resp = await client.get("/transactions?limit=500", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422


async def test_owner_can_generate_mock_data(client):
    token = await _register(client, "owner5@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/transactions/mock-data?count=25", headers=headers)
    assert resp.status_code == 201
    assert resp.json()["created"] == 25

    list_resp = await client.get("/transactions", headers=headers)
    assert list_resp.json()["total"] == 25


async def test_mock_data_transactions_have_no_receipt(client):
    token = await _register(client, "owner6@example.com")
    ledger_id = await _ledger_id(client, token)
    await client.post("/transactions/mock-data?count=5", headers={"Authorization": f"Bearer {token}"})

    async with client.session_maker() as db:
        rows = (await db.scalars(select(Transaction).where(Transaction.ledger_id == ledger_id))).all()
    assert len(rows) == 5
    assert all(r.receipt_id is None for r in rows)


async def test_editor_cannot_generate_mock_data(client):
    owner_token = await _register(client, "owner7@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    editor_token = await _add_member(client, ledger_id, "editor7@example.com", LedgerRole.editor)

    resp = await client.post(
        f"/transactions/mock-data?ledger_id={ledger_id}&count=5",
        headers={"Authorization": f"Bearer {editor_token}"},
    )
    assert resp.status_code == 403


async def test_viewer_cannot_generate_mock_data(client):
    owner_token = await _register(client, "owner8@example.com")
    ledger_id = await _ledger_id(client, owner_token)
    viewer_token = await _add_member(client, ledger_id, "viewer8@example.com", LedgerRole.viewer)

    resp = await client.post(
        f"/transactions/mock-data?ledger_id={ledger_id}&count=5",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert resp.status_code == 403


async def test_mock_data_count_is_capped(client):
    token = await _register(client, "owner9@example.com")
    resp = await client.post("/transactions/mock-data?count=20001", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422
