from calendar import monthrange
from datetime import date

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Shipment
from app.schemas import DashboardSummary, MonthlyShipmentCount, StatusBreakdown, TopCustomer

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


async def build_dashboard_summary(db: AsyncSession, workspace_id: int, month: str) -> DashboardSummary:
    """Aggregates via SQL GROUP BY using SQLAlchemy's portable extract()/coalesce()
    (which compile to the right dialect-specific SQL on both SQLite in tests and
    Postgres in prod) instead of pulling every raw shipment row into Python —
    keeps the dashboard cheap to render even for workspaces with tens of thousands
    of rows (e.g. via the mock-data generator), where a row-dump approach would
    load and iterate most of them in-process on every request."""
    months = last_n_months(month)
    range_start, _ = month_bounds(months[0])
    month_start, month_end = month_bounds(month)

    # Portable "YYYY-MM" bucket as an integer (year*100 + month).
    bucket_expr = (extract("year", Shipment.shipment_date) * 100 + extract("month", Shipment.shipment_date)).label(
        "bucket"
    )
    trend_rows = (
        await db.execute(
            select(bucket_expr, func.count())
            .where(
                Shipment.workspace_id == workspace_id,
                Shipment.shipment_date >= range_start,
                Shipment.shipment_date <= month_end,
            )
            .group_by(bucket_expr)
        )
    ).all()

    monthly_counts: dict[str, int] = {m: 0 for m in months}
    for bucket, count in trend_rows:
        bucket = int(bucket)
        key = f"{bucket // 100:04d}-{bucket % 100:02d}"
        if key in monthly_counts:
            monthly_counts[key] = count

    status_rows = (
        await db.execute(
            select(Shipment.status, func.count())
            .where(
                Shipment.workspace_id == workspace_id,
                Shipment.shipment_date >= month_start,
                Shipment.shipment_date <= month_end,
            )
            .group_by(Shipment.status)
        )
    ).all()
    status_breakdown = sorted(
        (StatusBreakdown(status=status.value, count=count) for status, count in status_rows),
        key=lambda s: s.count,
        reverse=True,
    )

    customer_name_expr = func.coalesce(Customer.name, "Unassigned")
    customer_rows = (
        await db.execute(
            select(customer_name_expr, func.count())
            .select_from(Shipment)
            .outerjoin(Customer, Customer.id == Shipment.customer_id)
            .where(
                Shipment.workspace_id == workspace_id,
                Shipment.shipment_date >= month_start,
                Shipment.shipment_date <= month_end,
            )
            .group_by(customer_name_expr)
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()
    top_customers = [TopCustomer(customer_name=name, shipment_count=count) for name, count in customer_rows]

    return DashboardSummary(
        month=month,
        total_shipments=sum(count for _, count in status_rows),
        status_breakdown=status_breakdown,
        monthly_trend=[MonthlyShipmentCount(month=m, count=monthly_counts[m]) for m in months],
        top_customers=top_customers,
    )
