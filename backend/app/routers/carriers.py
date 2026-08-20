from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Carrier, FreightMode, User
from app.schemas import CarrierOut, CreateCarrierRequest
from app.workspaces import require_editor, resolve_workspace_membership

router = APIRouter(prefix="/carriers", tags=["carriers"])


@router.get("", response_model=list[CarrierOut])
async def list_carriers(
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)

    result = await db.scalars(
        select(Carrier).where(Carrier.workspace_id == workspace.id).order_by(Carrier.name)
    )
    return [
        CarrierOut(id=c.id, name=c.name, mode=c.mode.value, contact_email=c.contact_email) for c in result.all()
    ]


@router.post("", response_model=CarrierOut, status_code=status.HTTP_201_CREATED)
async def create_carrier(
    payload: CreateCarrierRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    carrier = Carrier(
        workspace_id=workspace.id,
        name=payload.name,
        mode=FreightMode(payload.mode),
        contact_email=payload.contact_email,
    )
    db.add(carrier)
    await db.commit()
    await db.refresh(carrier)

    return CarrierOut(id=carrier.id, name=carrier.name, mode=carrier.mode.value, contact_email=carrier.contact_email)
