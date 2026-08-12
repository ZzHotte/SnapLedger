from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.ledgers import resolve_ledger_membership
from app.models import Transaction, User
from app.schemas import TransactionOut

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    ledger_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # any active member (owner/editor/viewer) can read
    ledger, _role = await resolve_ledger_membership(db, current_user, ledger_id)
    result = await db.scalars(
        select(Transaction)
        .where(Transaction.ledger_id == ledger.id)
        .options(selectinload(Transaction.category), selectinload(Transaction.receipt))
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())
    )
    transactions = result.all()

    return [
        TransactionOut(
            id=t.id,
            amount=float(t.amount),
            currency=t.currency,
            merchant=t.merchant,
            transaction_date=t.transaction_date,
            category=t.category.name if t.category else None,
            receipt_image_url=t.receipt.image_url if t.receipt else None,
            created_at=t.created_at,
        )
        for t in transactions
    ]
