from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dashboard import build_dashboard_summary
from app.database import get_db
from app.deps import get_current_user
from app.ledgers import resolve_ledger_membership
from app.models import User
from app.schemas import MONTH_PATTERN, DashboardSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    ledger_id: int | None = None,
    month: str | None = Query(default=None, pattern=MONTH_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ledger, _role = await resolve_ledger_membership(db, current_user, ledger_id)
    target_month = month or date.today().strftime("%Y-%m")
    return await build_dashboard_summary(db, ledger.id, target_month)
