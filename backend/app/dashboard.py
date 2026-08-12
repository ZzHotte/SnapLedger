from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import extract, func, select
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
    """Aggregates via SQL GROUP BY using SQLAlchemy's portable extract()/coalesce()
    (which compile to the right dialect-specific SQL on both SQLite in tests and
    Postgres in prod) instead of pulling every raw transaction row into Python —
    keeps the dashboard cheap to render even for ledgers with tens of thousands of
    rows (e.g. via the mock-data generator), where the old row-dump approach would
    load and iterate most of them in-process on every request."""
    months = last_n_months(month)
    range_start, _ = month_bounds(months[0])
    month_start, month_end = month_bounds(month)

    # Portable "YYYY-MM" bucket as an integer (year*100 + month).
    bucket_expr = (extract("year", Transaction.transaction_date) * 100 + extract("month", Transaction.transaction_date)).label(
        "bucket"
    )
    trend_rows = (
        await db.execute(
            select(bucket_expr, func.sum(Transaction.amount))
            .where(
                Transaction.ledger_id == ledger_id,
                Transaction.transaction_date >= range_start,
                Transaction.transaction_date <= month_end,
            )
            .group_by(bucket_expr)
        )
    ).all()

    monthly_totals: dict[str, Decimal] = {m: Decimal("0") for m in months}
    for bucket, total in trend_rows:
        bucket = int(bucket)
        key = f"{bucket // 100:04d}-{bucket % 100:02d}"
        if key in monthly_totals:
            monthly_totals[key] = total

    category_name_expr = func.coalesce(Category.name, "Other")
    category_rows = (
        await db.execute(
            select(category_name_expr, func.sum(Transaction.amount))
            .select_from(Transaction)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .where(
                Transaction.ledger_id == ledger_id,
                Transaction.transaction_date >= month_start,
                Transaction.transaction_date <= month_end,
            )
            .group_by(category_name_expr)
        )
    ).all()
    category_totals: dict[str, Decimal] = dict(category_rows)

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
