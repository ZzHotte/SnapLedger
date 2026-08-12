import pytest
from fastapi import HTTPException

from app.ledgers import get_owned_ledger, resolve_category
from app.models import Category, Ledger, User


async def _make_user_with_ledger(db_session, categories=("Food", "Other")):
    user = User(email="ledgertest@example.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()

    ledger = Ledger(name="Personal", owner_id=user.id)
    db_session.add(ledger)
    await db_session.flush()

    for name in categories:
        db_session.add(Category(ledger_id=ledger.id, name=name, is_default=True))
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(ledger)
    return user, ledger


async def test_get_owned_ledger_returns_the_users_ledger(db_session):
    user, ledger = await _make_user_with_ledger(db_session)
    found = await get_owned_ledger(db_session, user)
    assert found.id == ledger.id


async def test_get_owned_ledger_404s_when_user_has_no_ledger(db_session):
    user = User(email="noledger@example.com", password_hash="x")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    with pytest.raises(HTTPException) as exc_info:
        await get_owned_ledger(db_session, user)
    assert exc_info.value.status_code == 404


async def test_resolve_category_matches_by_name(db_session):
    _, ledger = await _make_user_with_ledger(db_session)
    category = await resolve_category(db_session, ledger.id, "Food")
    assert category is not None
    assert category.name == "Food"


async def test_resolve_category_falls_back_to_other_for_unknown_name(db_session):
    _, ledger = await _make_user_with_ledger(db_session)
    category = await resolve_category(db_session, ledger.id, "NotARealCategory")
    assert category is not None
    assert category.name == "Other"


async def test_resolve_category_falls_back_to_other_for_none(db_session):
    _, ledger = await _make_user_with_ledger(db_session)
    category = await resolve_category(db_session, ledger.id, None)
    assert category is not None
    assert category.name == "Other"
