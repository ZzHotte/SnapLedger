import random
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.constants import DEFAULT_MOCK_COUNT, MAX_MOCK_COUNT, MOCK_CARGO, MOCK_PORTS
from app.database import get_db
from app.deps import get_current_user
from app.models import Carrier, Customer, FreightMode, Quote, Shipment, ShipmentStatus, TrackingEvent, User
from app.schemas import (
    CreateQuoteRequest,
    CreateShipmentRequest,
    CreateTrackingEventRequest,
    GenerateMockDataResponse,
    QuoteOut,
    ShipmentDetailOut,
    ShipmentListOut,
    ShipmentOut,
    TrackingEventOut,
    UpdateShipmentStatusRequest,
)
from app.workspaces import require_editor, require_owner, resolve_workspace_membership

router = APIRouter(prefix="/shipments", tags=["shipments"])


def _to_shipment_out(s: Shipment) -> ShipmentOut:
    return ShipmentOut(
        id=s.id,
        customer_name=s.customer.name if s.customer else None,
        carrier_name=s.carrier.name if s.carrier else None,
        freight_mode=s.freight_mode.value,
        origin_port=s.origin_port,
        destination_port=s.destination_port,
        cargo_description=s.cargo_description,
        container_no=s.container_no,
        weight_kg=float(s.weight_kg) if s.weight_kg is not None else None,
        freight_cost=float(s.freight_cost) if s.freight_cost is not None else None,
        currency=s.currency,
        status=s.status.value,
        shipment_date=s.shipment_date,
        eta=s.eta,
        document_file_url=s.document.file_url if s.document else None,
        created_at=s.created_at,
    )


SORT_COLUMNS = {
    "shipment_date": Shipment.shipment_date,
    "customer": Customer.name,
    "cost": Shipment.freight_cost,
    "status": Shipment.status,
}


@router.get("", response_model=ShipmentListOut)
async def list_shipments(
    workspace_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=255),
    status_filter: list[str] | None = Query(default=None, alias="status"),
    sort_by: str = Query(default="shipment_date", pattern="^(shipment_date|customer|cost|status)$"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # any active member (owner/editor/viewer) can read
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)

    statuses: list[ShipmentStatus] = []
    if status_filter:
        try:
            statuses = [ShipmentStatus(s) for s in status_filter]
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status value")

    # Sorting/searching by customer name needs the join; other sort/search
    # combinations don't, so skip it then — a plain WHERE workspace_id=? scan
    # stays index-only instead of paying for a join every request.
    needs_customer_join = bool(q) or sort_by == "customer"

    def _scope(stmt):
        stmt = stmt.where(Shipment.workspace_id == workspace.id)
        if needs_customer_join:
            stmt = stmt.outerjoin(Customer, Customer.id == Shipment.customer_id)
        if statuses:
            stmt = stmt.where(Shipment.status.in_(statuses))
        if q:
            pattern = f"%{q}%"
            stmt = stmt.where(
                or_(
                    Customer.name.ilike(pattern),
                    Shipment.origin_port.ilike(pattern),
                    Shipment.destination_port.ilike(pattern),
                    Shipment.cargo_description.ilike(pattern),
                    Shipment.container_no.ilike(pattern),
                )
            )
        return stmt

    total = await db.scalar(_scope(select(func.count()).select_from(Shipment)))

    sort_column = SORT_COLUMNS[sort_by]
    order = sort_column.asc() if sort_dir == "asc" else sort_column.desc()

    result = await db.scalars(
        _scope(select(Shipment))
        .options(
            selectinload(Shipment.customer), selectinload(Shipment.carrier), selectinload(Shipment.document)
        )
        # id as a final tiebreaker keeps pagination stable even when many rows
        # share the same sort value (e.g. bulk-generated mock data all sorting
        # equal on status, or nulls on cost)
        .order_by(order, Shipment.id.desc())
        .limit(limit)
        .offset(offset)
    )
    shipments = result.all()

    return ShipmentListOut(items=[_to_shipment_out(s) for s in shipments], total=total)


@router.post("", response_model=ShipmentOut, status_code=status.HTTP_201_CREATED)
async def create_shipment(
    payload: CreateShipmentRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creates a shipment with no source document — the manual-entry path for
    when there's nothing to scan (e.g. a booking taken over the phone)."""
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    shipment = Shipment(
        workspace_id=workspace.id,
        created_by=current_user.id,
        customer_id=payload.customer_id,
        carrier_id=payload.carrier_id,
        freight_mode=FreightMode(payload.freight_mode),
        origin_port=payload.origin_port,
        destination_port=payload.destination_port,
        cargo_description=payload.cargo_description,
        container_no=payload.container_no,
        weight_kg=payload.weight_kg,
        freight_cost=payload.freight_cost,
        currency=payload.currency.upper(),
        shipment_date=payload.shipment_date,
        eta=payload.eta,
        note=payload.note,
        document_id=None,
    )
    db.add(shipment)
    await db.commit()
    await db.refresh(shipment)

    customer = await db.get(Customer, shipment.customer_id)
    carrier = await db.get(Carrier, shipment.carrier_id) if shipment.carrier_id else None

    return ShipmentOut(
        id=shipment.id,
        customer_name=customer.name if customer else None,
        carrier_name=carrier.name if carrier else None,
        freight_mode=shipment.freight_mode.value,
        origin_port=shipment.origin_port,
        destination_port=shipment.destination_port,
        cargo_description=shipment.cargo_description,
        container_no=shipment.container_no,
        weight_kg=float(shipment.weight_kg) if shipment.weight_kg is not None else None,
        freight_cost=float(shipment.freight_cost) if shipment.freight_cost is not None else None,
        currency=shipment.currency,
        status=shipment.status.value,
        shipment_date=shipment.shipment_date,
        eta=shipment.eta,
        document_file_url=None,
        created_at=shipment.created_at,
    )


@router.get("/{shipment_id}", response_model=ShipmentDetailOut)
async def get_shipment(
    shipment_id: int,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)

    shipment = await db.scalar(
        select(Shipment)
        .where(Shipment.id == shipment_id, Shipment.workspace_id == workspace.id)
        .options(
            selectinload(Shipment.customer),
            selectinload(Shipment.carrier),
            selectinload(Shipment.document),
            selectinload(Shipment.quotes).selectinload(Quote.carrier),
            selectinload(Shipment.tracking_events),
        )
    )
    if shipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    base = _to_shipment_out(shipment)
    return ShipmentDetailOut(
        **base.model_dump(),
        quotes=[
            QuoteOut(
                id=q.id,
                carrier_name=q.carrier.name,
                amount=float(q.amount),
                currency=q.currency,
                valid_until=q.valid_until,
                status=q.status.value,
                created_at=q.created_at,
            )
            for q in sorted(shipment.quotes, key=lambda q: q.created_at)
        ],
        tracking_events=[
            TrackingEventOut(
                id=e.id, status=e.status.value, location=e.location, event_date=e.event_date, note=e.note
            )
            for e in sorted(shipment.tracking_events, key=lambda e: e.event_date)
        ],
    )


@router.patch("/{shipment_id}/status", response_model=ShipmentOut)
async def update_shipment_status(
    shipment_id: int,
    payload: UpdateShipmentStatusRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    shipment = await db.scalar(
        select(Shipment)
        .where(Shipment.id == shipment_id, Shipment.workspace_id == workspace.id)
        .options(selectinload(Shipment.customer), selectinload(Shipment.carrier), selectinload(Shipment.document))
    )
    if shipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    shipment.status = ShipmentStatus(payload.status)
    await db.commit()
    await db.refresh(shipment, attribute_names=["customer", "carrier", "document"])

    return _to_shipment_out(shipment)


@router.post(
    "/{shipment_id}/tracking-events", response_model=TrackingEventOut, status_code=status.HTTP_201_CREATED
)
async def add_tracking_event(
    shipment_id: int,
    payload: CreateTrackingEventRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    shipment = await db.get(Shipment, shipment_id)
    if shipment is None or shipment.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    event = TrackingEvent(
        shipment_id=shipment.id,
        status=ShipmentStatus(payload.status),
        location=payload.location,
        event_date=payload.event_date,
        note=payload.note,
    )
    db.add(event)
    # A new tracking event is treated as the shipment's latest known status.
    shipment.status = event.status
    await db.commit()
    await db.refresh(event)

    return TrackingEventOut(
        id=event.id, status=event.status.value, location=event.location, event_date=event.event_date, note=event.note
    )


@router.post("/{shipment_id}/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
async def add_quote(
    shipment_id: int,
    payload: CreateQuoteRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    shipment = await db.get(Shipment, shipment_id)
    if shipment is None or shipment.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")

    carrier = await db.get(Carrier, payload.carrier_id)
    if carrier is None or carrier.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown carrier")

    quote = Quote(
        shipment_id=shipment.id,
        carrier_id=carrier.id,
        amount=payload.amount,
        currency=payload.currency.upper(),
        valid_until=payload.valid_until,
    )
    db.add(quote)
    await db.commit()
    await db.refresh(quote)

    return QuoteOut(
        id=quote.id,
        carrier_name=carrier.name,
        amount=float(quote.amount),
        currency=quote.currency,
        valid_until=quote.valid_until,
        status=quote.status.value,
        created_at=quote.created_at,
    )


@router.post("/mock-data", response_model=GenerateMockDataResponse, status_code=status.HTTP_201_CREATED)
async def generate_mock_data(
    workspace_id: int | None = None,
    count: int = Query(default=DEFAULT_MOCK_COUNT, ge=1, le=MAX_MOCK_COUNT),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk-inserts randomized shipments with no document attached, for testing
    dashboard/list rendering at scale. Owner-only — this is a data-mutating dev
    tool, not something editors/viewers on a shared workspace should be able to spam."""
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_owner(role)

    customer_ids = (await db.scalars(select(Customer.id).where(Customer.workspace_id == workspace.id))).all()
    if not customer_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace has no customers yet")

    # Pure CPU-bound random-data generation — off the event loop so it doesn't
    # stall every other request this worker is handling while it runs, same
    # reasoning as documents.py's run_in_threadpool use for its blocking calls.
    rows = await run_in_threadpool(_build_mock_rows, workspace.id, current_user.id, customer_ids, count)

    await db.execute(insert(Shipment), rows)
    await db.commit()

    return GenerateMockDataResponse(created=count)


def _build_mock_rows(workspace_id: int, user_id: int, customer_ids: list[int], count: int) -> list[dict]:
    today = date.today()
    modes = list(FreightMode)
    statuses = list(ShipmentStatus)
    return [
        (
            lambda origin, destination: {
                "workspace_id": workspace_id,
                "created_by": user_id,
                "customer_id": random.choice(customer_ids),
                "carrier_id": None,
                "freight_mode": random.choice(modes),
                "origin_port": origin,
                "destination_port": destination,
                "cargo_description": random.choice(MOCK_CARGO),
                "weight_kg": Decimal(str(round(random.uniform(50, 20000), 2))),
                "freight_cost": Decimal(str(round(random.uniform(200, 15000), 2))),
                "currency": "USD",
                "status": random.choice(statuses),
                "shipment_date": today - timedelta(days=random.randint(0, 364)),
                "document_id": None,
            }
        )(*random.choice(MOCK_PORTS))
        for _ in range(count)
    ]
