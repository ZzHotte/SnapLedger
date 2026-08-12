from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.ledgers import require_editor, resolve_category, resolve_ledger_membership
from app.models import Budget, User
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

    category = await resolve_category(db, ledger.id, payload.category)

    budget = await db.scalar(
        select(Budget).where(
            Budget.ledger_id == ledger.id, Budget.category_id == category.id, Budget.month == payload.month
        )
    )
    if budget is None:
        budget = Budget(
            ledger_id=ledger.id, category_id=category.id, month=payload.month, planned_amount=payload.planned_amount
        )
        db.add(budget)
    else:
        budget.planned_amount = payload.planned_amount

    await db.commit()
    await db.refresh(budget)

    return BudgetOut(id=budget.id, category=category.name, month=budget.month, planned_amount=float(budget.planned_amount))
