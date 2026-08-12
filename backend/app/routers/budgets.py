from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.ledgers import require_editor, resolve_ledger_membership
from app.models import Budget, Category, User
from app.schemas import MONTH_PATTERN, BudgetOut, UpsertBudgetRequest

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetOut])
async def list_budgets(
    month: str = Query(pattern=MONTH_PATTERN),
    ledger_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ledger, _role = await resolve_ledger_membership(db, current_user, ledger_id)

    result = await db.scalars(
        select(Budget)
        .where(Budget.ledger_id == ledger.id, Budget.month == month)
        .options(selectinload(Budget.category))
    )
    budgets = result.all()
    return [
        BudgetOut(id=b.id, category=b.category.name, month=b.month, planned_amount=float(b.planned_amount))
        for b in budgets
    ]


@router.put("", response_model=BudgetOut)
async def upsert_budget(
    payload: UpsertBudgetRequest,
    ledger_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ledger, role = await resolve_ledger_membership(db, current_user, ledger_id)
    require_editor(role)

    # Unlike receipts' AI-extracted category (which reasonably falls back to
    # "Other" via resolve_category when the model returns something unrecognized),
    # a budget's category comes from a direct API call — silently filing it under
    # "Other" would hide a typo/bad request from the caller, so require an exact
    # match here instead.
    category = await db.scalar(
        select(Category).where(Category.ledger_id == ledger.id, Category.name == payload.category)
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown category: {payload.category}")

    # Captured as plain values rather than kept as live attribute access on the
    # `category`/`ledger` ORM objects: db.rollback() below expires every object
    # tracked by this session, and touching an expired attribute triggers an
    # implicit lazy-load that needs a greenlet context we're not in at that point
    # (raises MissingGreenlet) — plain ints/strings don't have this problem.
    ledger_id_val = ledger.id
    category_id_val = category.id
    category_name = category.name

    budget = await db.scalar(
        select(Budget).where(
            Budget.ledger_id == ledger_id_val, Budget.category_id == category_id_val, Budget.month == payload.month
        )
    )
    if budget is None:
        budget = Budget(
            ledger_id=ledger_id_val,
            category_id=category_id_val,
            month=payload.month,
            planned_amount=payload.planned_amount,
        )
        db.add(budget)
        try:
            await db.commit()
        except IntegrityError:
            # Another request created the same (ledger, category, month) budget
            # between our SELECT and this INSERT. Retry as an update instead of
            # erroring — PUT is supposed to be idempotent, so the caller's intent
            # ("this category should have this budget") should still be honored.
            await db.rollback()
            budget = await db.scalar(
                select(Budget).where(
                    Budget.ledger_id == ledger_id_val,
                    Budget.category_id == category_id_val,
                    Budget.month == payload.month,
                )
            )
            budget.planned_amount = payload.planned_amount
            await db.commit()
    else:
        budget.planned_amount = payload.planned_amount
        await db.commit()

    await db.refresh(budget)

    return BudgetOut(id=budget.id, category=category_name, month=budget.month, planned_amount=float(budget.planned_amount))
