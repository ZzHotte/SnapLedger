from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.ledgers import list_user_ledgers, require_editor, resolve_category, resolve_ledger_membership
from app.models import Category, Ledger, LedgerMember, LedgerRole, MemberStatus, User


async def _make_user_with_ledger(db_session, categories=("Food", "Other")):
    user = User(email="ledgertest@example.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()

    ledger = Ledger(name="Personal", owner_id=user.id)
    db_session.add(ledger)
    await db_session.flush()

    db_session.add(
        LedgerMember(
            ledger_id=ledger.id,
            user_id=user.id,
            role=LedgerRole.owner,
            status=MemberStatus.active,
            joined_at=datetime.now(timezone.utc),
        )
    )
    for name in categories:
        db_session.add(Category(ledger_id=ledger.id, name=name, is_default=True))
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(ledger)
    return user, ledger


async def _add_member(db_session, ledger, email, role):
    user = User(email=email, password_hash="x")
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        LedgerMember(
            ledger_id=ledger.id,
            user_id=user.id,
            role=role,
            status=MemberStatus.active,
            joined_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_resolve_ledger_membership_defaults_to_owned_ledger(db_session):
    user, ledger = await _make_user_with_ledger(db_session)
    found, role = await resolve_ledger_membership(db_session, user, ledger_id=None)
    assert found.id == ledger.id
    assert role == LedgerRole.owner


async def test_resolve_ledger_membership_404s_when_user_has_no_ledger(db_session):
    user = User(email="noledger@example.com", password_hash="x")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    with pytest.raises(HTTPException) as exc_info:
        await resolve_ledger_membership(db_session, user, ledger_id=None)
    assert exc_info.value.status_code == 404


async def test_resolve_ledger_membership_by_id_returns_caller_role(db_session):
    owner, ledger = await _make_user_with_ledger(db_session)
    viewer = await _add_member(db_session, ledger, "viewer@example.com", LedgerRole.viewer)

    found, role = await resolve_ledger_membership(db_session, viewer, ledger_id=ledger.id)
    assert found.id == ledger.id
    assert role == LedgerRole.viewer


async def test_resolve_ledger_membership_404s_for_ledger_caller_is_not_a_member_of(db_session):
    _, ledger = await _make_user_with_ledger(db_session)
    outsider = User(email="outsider@example.com", password_hash="x")
    db_session.add(outsider)
    await db_session.commit()
    await db_session.refresh(outsider)

    with pytest.raises(HTTPException) as exc_info:
        await resolve_ledger_membership(db_session, outsider, ledger_id=ledger.id)
    assert exc_info.value.status_code == 404


def test_require_editor_allows_owner_and_editor():
    require_editor(LedgerRole.owner)
    require_editor(LedgerRole.editor)


def test_require_editor_blocks_viewer():
    with pytest.raises(HTTPException) as exc_info:
        require_editor(LedgerRole.viewer)
    assert exc_info.value.status_code == 403


async def test_list_user_ledgers_returns_active_memberships_with_roles(db_session):
    owner, ledger = await _make_user_with_ledger(db_session)
    await _add_member(db_session, ledger, "editor@example.com", LedgerRole.editor)

    ledgers = await list_user_ledgers(db_session, owner)
    assert [(led.id, role) for led, role in ledgers] == [(ledger.id, LedgerRole.owner)]


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
