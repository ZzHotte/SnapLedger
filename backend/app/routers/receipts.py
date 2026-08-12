from datetime import date

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.cloudinary_client import upload_receipt_image
from app.database import get_db
from app.deps import get_current_user
from app.gemini import extract_receipt_fields
from app.ledgers import require_editor, resolve_category, resolve_ledger_membership
from app.models import Receipt, ReceiptStatus, Transaction, User
from app.schemas import ConfirmReceiptRequest, ReceiptOut, TransactionOut

router = APIRouter(prefix="/receipts", tags=["receipts"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


@router.post("/upload", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
async def upload_receipt(
    file: UploadFile,
    ledger_id: int | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an image")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image too large (max 10MB)")

    ledger, role = await resolve_ledger_membership(db, current_user, ledger_id)
    require_editor(role)
    # upload_receipt_image/extract_receipt_fields are blocking sync calls (Cloudinary SDK,
    # google-genai sync client) — run them off the event loop so one slow upload doesn't
    # stall every other request this worker is handling.
    image_url = await run_in_threadpool(upload_receipt_image, contents)
    extracted = await run_in_threadpool(extract_receipt_fields, contents, file.content_type)

    receipt = Receipt(
        ledger_id=ledger.id,
        uploaded_by=current_user.id,
        image_url=image_url,
        extracted_merchant=extracted.get("merchant"),
        extracted_date=_parse_date(extracted.get("transaction_date")),
        extracted_amount=extracted.get("amount"),
        extracted_currency=extracted.get("currency"),
        extracted_category=extracted.get("category"),
        ocr_raw_json=extracted,
        status=ReceiptStatus.pending,
    )
    db.add(receipt)
    await db.commit()
    await db.refresh(receipt)

    return ReceiptOut(
        id=receipt.id,
        image_url=receipt.image_url,
        status=receipt.status.value,
        merchant=receipt.extracted_merchant,
        transaction_date=receipt.extracted_date,
        amount=float(receipt.extracted_amount) if receipt.extracted_amount is not None else None,
        currency=receipt.extracted_currency,
        category=receipt.extracted_category,
    )


@router.post("/{receipt_id}/confirm", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
async def confirm_receipt(
    receipt_id: int,
    payload: ConfirmReceiptRequest,
    ledger_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ledger, role = await resolve_ledger_membership(db, current_user, ledger_id)
    require_editor(role)
    receipt = await db.get(Receipt, receipt_id)
    if receipt is None or receipt.ledger_id != ledger.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    if receipt.status == ReceiptStatus.confirmed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Receipt already confirmed")

    category = await resolve_category(db, ledger.id, payload.category)

    transaction = Transaction(
        ledger_id=ledger.id,
        created_by=current_user.id,
        amount=payload.amount,
        currency=payload.currency.upper(),
        category_id=category.id if category else None,
        merchant=payload.merchant,
        transaction_date=payload.transaction_date,
        note=payload.note,
        receipt_id=receipt.id,
    )
    db.add(transaction)
    receipt.status = ReceiptStatus.confirmed
    try:
        await db.commit()
    except IntegrityError:
        # DB-level backstop for the check-then-act race above: two concurrent
        # confirms both passed the pending-status check before either committed.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Receipt already confirmed")
    await db.refresh(transaction)

    return TransactionOut(
        id=transaction.id,
        amount=float(transaction.amount),
        currency=transaction.currency,
        merchant=transaction.merchant,
        transaction_date=transaction.transaction_date,
        category=category.name if category else None,
        receipt_image_url=receipt.image_url,
        created_at=transaction.created_at,
    )
