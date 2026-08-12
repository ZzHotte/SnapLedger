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
        # Every user currently has exactly one owner-role membership (created at
        # registration; no code path grants a second one — invite/role-update
        # roles are restricted to editor/viewer). This ordering is a defensive
        # tiebreaker, not a real disambiguation: if a future feature ever lets a
        # user own more than one ledger, callers that omit ledger_id here need to
        # be revisited rather than silently landing on an arbitrary one.
        query = query.where(LedgerMember.role == LedgerRole.owner).order_by(LedgerMember.id)
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


async def ensure_capacity(db: AsyncSession, ledger_id: int) -> None:
    if await count_active_members(db, ledger_id) >= MAX_LEDGER_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ledger already has the maximum of {MAX_LEDGER_MEMBERS} members",
        )


async def get_active_member(db: AsyncSession, ledger_id: int, user_id: int) -> LedgerMember | None:
    return await db.scalar(
        select(LedgerMember).where(
            LedgerMember.ledger_id == ledger_id,
            LedgerMember.user_id == user_id,
            LedgerMember.status == MemberStatus.active,
        )
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
