from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.ledgers import list_user_ledgers
from app.models import User
from app.schemas import LedgerOut

router = APIRouter(prefix="/ledgers", tags=["ledgers"])


@router.get("", response_model=list[LedgerOut])
async def list_ledgers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ledgers = await list_user_ledgers(db, current_user)
    return [LedgerOut(id=ledger.id, name=ledger.name, role=role.value) for ledger, role in ledgers]
