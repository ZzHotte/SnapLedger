from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Customer, User
from app.schemas import CreateCustomerRequest, CustomerOut
from app.workspaces import require_editor, resolve_workspace_membership

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)

    result = await db.scalars(
        select(Customer).where(Customer.workspace_id == workspace.id).order_by(Customer.name)
    )
    return [
        CustomerOut(
            id=c.id, name=c.name, contact_name=c.contact_name, contact_email=c.contact_email, contact_phone=c.contact_phone
        )
        for c in result.all()
    ]


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CreateCustomerRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    customer = Customer(
        workspace_id=workspace.id,
        name=payload.name,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)

    return CustomerOut(
        id=customer.id,
        name=customer.name,
        contact_name=customer.contact_name,
        contact_email=customer.contact_email,
        contact_phone=customer.contact_phone,
    )
