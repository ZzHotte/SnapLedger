import random
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.ledgers import require_owner, resolve_ledger_membership
from app.models import Category, Transaction, User
from app.schemas import GenerateMockDataResponse, TransactionListOut, TransactionOut

router = APIRouter(prefix="/transactions", tags=["transactions"])

MAX_MOCK_COUNT = 20_000
MOCK_MERCHANTS = [
    "Trader Joe's",
    "Shell Gas Station",
    "Amazon",
    "Target",
    "Starbucks",
    "Uber",
    "Netflix",
    "Whole Foods",
    "Costco",
    "Corner Cafe",
    "AMC Theatres",
    "Home Depot",
    "IKEA",
    "CVS Pharmacy",
    "Chipotle",
]


@router.get("", response_model=TransactionListOut)
async def list_transactions(
    ledger_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # any active member (owner/editor/viewer) can read
    ledger, _role = await resolve_ledger_membership(db, current_user, ledger_id)

    total = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.ledger_id == ledger.id)
    )

    result = await db.scalars(
        select(Transaction)
        .where(Transaction.ledger_id == ledger.id)
        .options(selectinload(Transaction.category), selectinload(Transaction.receipt))
        # id as a final tiebreaker keeps pagination stable even when many rows share
        # the same transaction_date/created_at (e.g. bulk-generated mock data)
        .order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    )
    transactions = result.all()

    items = [
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
    return TransactionListOut(items=items, total=total)


@router.post("/mock-data", response_model=GenerateMockDataResponse, status_code=status.HTTP_201_CREATED)
async def generate_mock_data(
    ledger_id: int | None = None,
    count: int = Query(default=10_000, ge=1, le=MAX_MOCK_COUNT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-inserts randomized transactions with no receipt attached, for testing
    dashboard/list rendering at scale. Owner-only — this is a data-mutating dev
    tool, not something editors/viewers on a shared ledger should be able to spam."""
    ledger, role = await resolve_ledger_membership(db, current_user, ledger_id)
    require_owner(role)

    category_ids = (await db.scalars(select(Category.id).where(Category.ledger_id == ledger.id))).all()
    if not category_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ledger has no categories")

    today = date.today()
    rows = [
        {
            "ledger_id": ledger.id,
            "created_by": current_user.id,
            "amount": Decimal(str(round(random.uniform(1, 500), 2))),
            "currency": "USD",
            "category_id": random.choice(category_ids),
            "merchant": random.choice(MOCK_MERCHANTS),
            "transaction_date": today - timedelta(days=random.randint(0, 364)),
            "receipt_id": None,
        }
        for _ in range(count)
    ]

    await db.execute(insert(Transaction), rows)
    await db.commit()

    return GenerateMockDataResponse(created=count)
