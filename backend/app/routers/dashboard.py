from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dashboard import build_dashboard_summary
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import MONTH_PATTERN, DashboardSummary
from app.workspaces import resolve_workspace_membership

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    workspace_id: int | None = None,
    month: str | None = Query(default=None, pattern=MONTH_PATTERN),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)
    target_month = month or date.today().strftime("%Y-%m")
    return await build_dashboard_summary(db, workspace.id, target_month)
