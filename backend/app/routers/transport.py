from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Shipment, ShipmentPosition, User
from app.schemas import LivePositionOut, PingRequest
from app.workspaces import require_editor, resolve_workspace_membership

router = APIRouter(prefix="/transport", tags=["transport"])


@router.post("/ping", status_code=status.HTTP_204_NO_CONTENT)
async def ping(
    payload: PingRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upserts the live position for a shipment — one row per shipment, not a
    trail, since the Transport map only ever shows where a vehicle is now."""
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    shipment = await db.get(Shipment, payload.shipment_id)
    if shipment is None or shipment.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    existing = await db.scalar(select(ShipmentPosition).where(ShipmentPosition.shipment_id == payload.shipment_id))
    if existing:
        existing.lat = payload.lat
        existing.lng = payload.lng
        existing.accuracy_m = payload.accuracy_m
        existing.reported_by = current_user.id
    else:
        db.add(
            ShipmentPosition(
                shipment_id=payload.shipment_id,
                reported_by=current_user.id,
                lat=payload.lat,
                lng=payload.lng,
                accuracy_m=payload.accuracy_m,
            )
        )
    try:
        await db.commit()
    except IntegrityError:
        # Two pings for the same shipment landed at once and both passed the
        # check-then-act above — the loser just applies its fix as an update.
        await db.rollback()
        existing = await db.scalar(select(ShipmentPosition).where(ShipmentPosition.shipment_id == payload.shipment_id))
        if existing is None:
            raise
        existing.lat = payload.lat
        existing.lng = payload.lng
        existing.accuracy_m = payload.accuracy_m
        existing.reported_by = current_user.id
        await db.commit()


@router.get("/live", response_model=list[LivePositionOut])
async def live_positions(
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)

    rows = (
        await db.scalars(
            select(ShipmentPosition)
            .join(Shipment, ShipmentPosition.shipment_id == Shipment.id)
            .where(Shipment.workspace_id == workspace.id)
            .options(
                selectinload(ShipmentPosition.shipment).selectinload(Shipment.customer),
                selectinload(ShipmentPosition.reporter),
            )
        )
    ).all()

    return [
        LivePositionOut(
            shipment_id=p.shipment_id,
            ref=p.shipment.ref,
            customer_name=p.shipment.customer.name if p.shipment.customer else None,
            destination_port=p.shipment.destination_port,
            destination_lat=p.shipment.destination_lat,
            destination_lng=p.shipment.destination_lng,
            lat=p.lat,
            lng=p.lng,
            accuracy_m=p.accuracy_m,
            recorded_at=p.recorded_at,
            reported_by_name=p.reporter.name or p.reporter.email,
        )
        for p in rows
    ]
