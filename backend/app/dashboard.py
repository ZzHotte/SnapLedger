from calendar import monthrange
from datetime import date

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Shipment, ShipmentStatus
from app.schemas import (
    DashboardSummary,
    MoneyAmount,
    MonthlyShipmentCount,
    MonthlyStatusBreakdown,
    StatusBreakdown,
    TopCustomer,
)

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


def _amounts_from_totals(totals: dict[str, float]) -> list[MoneyAmount]:
    return [MoneyAmount(currency=currency, amount=amount) for currency, amount in totals.items()]


def _accumulate(totals_by_key: dict[str, dict[str, float]], key: str, currency: str, amount) -> None:
    if not amount:
        return
    per_currency = totals_by_key.setdefault(key, {})
    per_currency[currency] = per_currency.get(currency, 0.0) + float(amount)


async def build_dashboard_summary(db: AsyncSession, workspace_id: int, month: str) -> DashboardSummary:
    """Aggregates via SQL GROUP BY using SQLAlchemy's portable extract()/coalesce()
    (which compile to the right dialect-specific SQL on both SQLite in tests and
    Postgres in prod) instead of pulling every raw shipment row into Python —
    keeps the dashboard cheap to render even for workspaces with tens of thousands
    of rows (e.g. via the mock-data generator), where a row-dump approach would
    load and iterate most of them in-process on every request.

    Cancelled shipments are excluded from monthly_trend/top_customers/the total —
    they didn't actually move any freight, so counting them overstates real
    business activity. status_breakdown (and monthly_status_breakdown) are the
    exception: they deliberately include a "cancelled" row so cancellation
    volume stays visible somewhere. Money is summed per currency rather than
    blended into one number, since naively adding e.g. USD and EUR amounts
    together would be meaningless.
    """
    months = last_n_months(month)
    range_start, _ = month_bounds(months[0])
    month_start, month_end = month_bounds(month)

    active = Shipment.status != ShipmentStatus.cancelled

    # --- one query covering the whole trend window, grouped by month × status ×
    # currency. monthly_trend (cancelled excluded) and monthly_status_breakdown
    # (cancelled included, one entry per trend month — this lets the frontend
    # drill into any of the 6 trend months' status mix with zero extra
    # requests) are both derived from it, and month's own status_breakdown /
    # total is just that last bucket, so no separate query for either.
    bucket_expr = (extract("year", Shipment.shipment_date) * 100 + extract("month", Shipment.shipment_date)).label(
        "bucket"
    )
    trend_rows = (
        await db.execute(
            select(bucket_expr, Shipment.status, Shipment.currency, func.count(), func.sum(Shipment.freight_cost))
            .where(
                Shipment.workspace_id == workspace_id,
                Shipment.shipment_date >= range_start,
                Shipment.shipment_date <= month_end,
            )
            .group_by(bucket_expr, Shipment.status, Shipment.currency)
        )
    ).all()

    monthly_counts: dict[str, int] = {m: 0 for m in months}
    monthly_amounts: dict[str, dict[str, float]] = {}
    monthly_status_counts: dict[str, dict[str, int]] = {m: {} for m in months}
    monthly_status_amounts: dict[str, dict[str, dict[str, float]]] = {m: {} for m in months}

    for bucket, status_val, currency, count, total in trend_rows:
        bucket = int(bucket)
        key = f"{bucket // 100:04d}-{bucket % 100:02d}"
        if key not in monthly_counts:
            continue

        status_key = status_val.value
        monthly_status_counts[key][status_key] = monthly_status_counts[key].get(status_key, 0) + count
        _accumulate(monthly_status_amounts[key], status_key, currency, total)

        if status_val != ShipmentStatus.cancelled:
            monthly_counts[key] += count
            _accumulate(monthly_amounts, key, currency, total)

    monthly_trend = [
        MonthlyShipmentCount(
            month=m, count=monthly_counts[m], amounts=_amounts_from_totals(monthly_amounts.get(m, {}))
        )
        for m in months
    ]

    def _status_breakdown_for(m: str) -> list[StatusBreakdown]:
        return sorted(
            (
                StatusBreakdown(
                    status=status_key, count=count, amounts=_amounts_from_totals(monthly_status_amounts[m].get(status_key, {}))
                )
                for status_key, count in monthly_status_counts[m].items()
            ),
            key=lambda s: s.count,
            reverse=True,
        )

    monthly_status_breakdown = [MonthlyStatusBreakdown(month=m, status_breakdown=_status_breakdown_for(m)) for m in months]
    # `month` is always the last entry in `months` (last_n_months ends at it).
    status_breakdown = monthly_status_breakdown[-1].status_breakdown

    # --- top customers, cancelled excluded ---
    customer_name_expr = func.coalesce(Customer.name, "Unassigned")
    customer_rows = (
        await db.execute(
            select(customer_name_expr, Shipment.currency, func.count(), func.sum(Shipment.freight_cost))
            .select_from(Shipment)
            .outerjoin(Customer, Customer.id == Shipment.customer_id)
            .where(
                Shipment.workspace_id == workspace_id,
                Shipment.shipment_date >= month_start,
                Shipment.shipment_date <= month_end,
                active,
            )
            .group_by(customer_name_expr, Shipment.currency)
        )
    ).all()

    customer_counts: dict[str, int] = {}
    customer_amounts: dict[str, dict[str, float]] = {}
    for name, currency, count, total in customer_rows:
        customer_counts[name] = customer_counts.get(name, 0) + count
        _accumulate(customer_amounts, name, currency, total)

    top_customers = sorted(
        (
            TopCustomer(
                customer_name=name, shipment_count=count, amounts=_amounts_from_totals(customer_amounts.get(name, {}))
            )
            for name, count in customer_counts.items()
        ),
        key=lambda c: c.shipment_count,
        reverse=True,
    )[:5]

    # --- total for the month, cancelled excluded — derived from status_breakdown
    # rather than a separate query, since it already covers exactly this
    # month's rows and just needs the cancelled entry left out.
    total_shipments = sum(s.count for s in status_breakdown if s.status != ShipmentStatus.cancelled.value)
    total_amount_totals: dict[str, float] = {}
    for s in status_breakdown:
        if s.status == ShipmentStatus.cancelled.value:
            continue
        for a in s.amounts:
            total_amount_totals[a.currency] = total_amount_totals.get(a.currency, 0.0) + a.amount

    return DashboardSummary(
        month=month,
        total_shipments=total_shipments,
        total_amounts=_amounts_from_totals(total_amount_totals),
        status_breakdown=status_breakdown,
        monthly_trend=monthly_trend,
        monthly_status_breakdown=monthly_status_breakdown,
        top_customers=top_customers,
    )
