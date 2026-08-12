from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Ledger, User


async def get_owned_ledger(db: AsyncSession, user: User) -> Ledger:
    """The ledger every user gets auto-created on signup. Until ledger-switching UI
    exists, this is the only ledger read/write endpoints operate against."""
    ledger = await db.scalar(select(Ledger).where(Ledger.owner_id == user.id))
    if ledger is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No ledger found for user")
    return ledger


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
