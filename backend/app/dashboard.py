from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Budget, Category, Transaction
from app.schemas import BudgetProgress, CategorySpend, DashboardSummary, MonthlyTotal

TREND_MONTHS = 6


def last_n_months(month: str, n: int = TREND_MONTHS) -> list[str]:
    """n "YYYY-MM" strings ending at (and including) `month`, oldest first."""
    year, mon = map(int, month.split("-"))
    months = []
    for _ in range(n):
        months.append(f"{year:04d}-{mon:02d}")
        mon -= 1
        if mon == 0:
            mon = 12
            year -= 1
    return list(reversed(months))


def month_bounds(month: str) -> tuple[date, date]:
    year, mon = map(int, month.split("-"))
    start = date(year, mon, 1)
    end = date(year, mon, monthrange(year, mon)[1])
    return start, end


async def build_dashboard_summary(db: AsyncSession, ledger_id: int, month: str) -> DashboardSummary:
    """Aggregates in Python rather than with DB-specific date-grouping functions
    (to_char/date_trunc), since tests run against SQLite while production is
    Postgres — this keeps the query portable at the cost of pulling the window's
    raw rows into memory, which is fine at personal-ledger transaction volumes."""
    months = last_n_months(month)
    range_start, _ = month_bounds(months[0])
    _, range_end = month_bounds(month)

    rows = (
        await db.execute(
            select(Transaction.amount, Transaction.transaction_date, Category.name)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .where(
                Transaction.ledger_id == ledger_id,
                Transaction.transaction_date >= range_start,
                Transaction.transaction_date <= range_end,
            )
        )
    ).all()

    monthly_totals: dict[str, Decimal] = {m: Decimal("0") for m in months}
    category_totals: dict[str, Decimal] = {}
    for amount, tx_date, category_name in rows:
        key = f"{tx_date.year:04d}-{tx_date.month:02d}"
        if key in monthly_totals:
            monthly_totals[key] += amount
        if key == month:
            name = category_name or "Other"
            category_totals[name] = category_totals.get(name, Decimal("0")) + amount

    budget_rows = (
        await db.execute(
            select(Budget.planned_amount, Category.name)
            .join(Category, Category.id == Budget.category_id)
            .where(Budget.ledger_id == ledger_id, Budget.month == month)
        )
    ).all()

    budgets = [
        BudgetProgress(
            category=name,
            planned_amount=float(planned),
            actual_amount=float(category_totals.get(name, Decimal("0"))),
        )
        for planned, name in budget_rows
    ]

    category_breakdown = sorted(
        (CategorySpend(category=name, amount=float(amount)) for name, amount in category_totals.items()),
        key=lambda c: c.amount,
        reverse=True,
    )

    return DashboardSummary(
        month=month,
        total_spent=float(sum(category_totals.values(), Decimal("0"))),
        category_breakdown=category_breakdown,
        monthly_trend=[MonthlyTotal(month=m, amount=float(monthly_totals[m])) for m in months],
        budgets=budgets,
    )
