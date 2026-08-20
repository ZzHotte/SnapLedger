from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.cloudinary_client import upload_document_file
from app.database import get_db
from app.deps import get_current_user
from app.gemini import extract_document_fields
from app.models import Carrier, Customer, Document, DocumentStatus, FreightMode, Shipment, User
from app.schemas import ConfirmDocumentRequest, DocumentOut, ShipmentOut
from app.workspaces import require_editor, resolve_workspace_membership

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    workspace_id: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (file.content_type or "") not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an image or PDF")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 10MB)")

    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)
    # upload_document_file/extract_document_fields are blocking sync calls (Cloudinary
    # SDK, google-genai sync client) — run them off the event loop so one slow upload
    # doesn't stall every other request this worker is handling.
    file_url = await run_in_threadpool(upload_document_file, contents)
    extracted = await run_in_threadpool(extract_document_fields, contents, file.content_type)

    document = Document(
        workspace_id=workspace.id,
        uploaded_by=current_user.id,
        file_url=file_url,
        extracted_doc_type=extracted.get("doc_type"),
        extracted_bl_number=extracted.get("bl_number"),
        extracted_shipper=extracted.get("shipper"),
        extracted_consignee=extracted.get("consignee"),
        extracted_port_of_loading=extracted.get("origin_port"),
        extracted_port_of_discharge=extracted.get("destination_port"),
        extracted_cargo_description=extracted.get("cargo_description"),
        extracted_weight_kg=extracted.get("weight_kg"),
        ocr_raw_json=extracted,
        status=DocumentStatus.pending,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    return DocumentOut(
        id=document.id,
        file_url=document.file_url,
        status=document.status.value,
        doc_type=document.extracted_doc_type,
        bl_number=document.extracted_bl_number,
        shipper=document.extracted_shipper,
        consignee=document.extracted_consignee,
        origin_port=document.extracted_port_of_loading,
        destination_port=document.extracted_port_of_discharge,
        cargo_description=document.extracted_cargo_description,
        weight_kg=float(document.extracted_weight_kg) if document.extracted_weight_kg is not None else None,
    )


@router.post("/{document_id}/confirm", response_model=ShipmentOut, status_code=status.HTTP_201_CREATED)
async def confirm_document(
    document_id: int,
    payload: ConfirmDocumentRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)
    document = await db.get(Document, document_id)
    if document is None or document.workspace_id != workspace.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    if document.status == DocumentStatus.confirmed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document already confirmed")

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
        document_id=document.id,
    )
    db.add(shipment)
    document.status = DocumentStatus.confirmed
    try:
        await db.commit()
    except IntegrityError:
        # DB-level backstop for the check-then-act race above: two concurrent
        # confirms both passed the pending-status check before either committed.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document already confirmed")
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
        document_file_url=document.file_url,
        created_at=shipment.created_at,
    )
