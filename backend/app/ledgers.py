from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Ledger, LedgerMember, LedgerRole, MemberStatus, User

MAX_LEDGER_MEMBERS = 5


async def resolve_ledger_membership(
    db: AsyncSession, user: User, ledger_id: int | None
) -> tuple[Ledger, LedgerRole]:
    """Resolve which ledger a request operates against and the caller's role in it.

    With no ledger_id (the default before ledger-switching UI sends one explicitly),
    falls back to the user's own personal ledger. A ledger_id the user isn't an active
    member of 404s rather than 403s, so membership can't be probed by ID.
    """
    query = select(LedgerMember).where(
        LedgerMember.user_id == user.id, LedgerMember.status == MemberStatus.active
    )
    if ledger_id is None:
        query = query.where(LedgerMember.role == LedgerRole.owner)
    else:
        query = query.where(LedgerMember.ledger_id == ledger_id)

    member = await db.scalar(query)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ledger not found")

    ledger = await db.get(Ledger, member.ledger_id)
    return ledger, member.role


def require_editor(role: LedgerRole) -> None:
    if role == LedgerRole.viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Viewers cannot make changes to this ledger"
        )


def require_owner(role: LedgerRole) -> None:
    if role != LedgerRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the ledger owner can do this"
        )


async def count_active_members(db: AsyncSession, ledger_id: int) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(LedgerMember)
        .where(LedgerMember.ledger_id == ledger_id, LedgerMember.status == MemberStatus.active)
    )


async def list_user_ledgers(db: AsyncSession, user: User) -> list[tuple[Ledger, LedgerRole]]:
    result = await db.execute(
        select(Ledger, LedgerMember.role)
        .join(LedgerMember, LedgerMember.ledger_id == Ledger.id)
        .where(LedgerMember.user_id == user.id, LedgerMember.status == MemberStatus.active)
        .order_by(Ledger.created_at)
    )
    return [(ledger, role) for ledger, role in result.all()]


async def resolve_category(db: AsyncSession, ledger_id: int, name: str | None) -> Category | None:
    if not name:
        name = "Other"
    category = await db.scalar(
        select(Category).where(Category.ledger_id == ledger_id, Category.name == name)
    )
    if category is None:
        category = await db.scalar(
            select(Category).where(Category.ledger_id == ledger_id, Category.name == "Other")
        )
    return category
