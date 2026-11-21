from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Customer, User
from app.schemas import CreateCustomerRequest, CustomerOut, ReorderCustomersRequest
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
        select(Customer)
        .where(Customer.workspace_id == workspace.id)
        .order_by(Customer.sort_order, Customer.name)
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

    # New customers land at the end of the drag-ordered list, not wherever
    # alphabetical order would otherwise put them.
    next_sort_order = await db.scalar(
        select(func.coalesce(func.max(Customer.sort_order), -1) + 1).where(Customer.workspace_id == workspace.id)
    )

    customer = Customer(
        workspace_id=workspace.id,
        name=payload.name,
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        sort_order=next_sort_order,
    )
    db.add(customer)
    await db.commit()

    return CustomerOut(
        id=customer.id,
        name=customer.name,
        contact_name=customer.contact_name,
        contact_email=customer.contact_email,
        contact_phone=customer.contact_phone,
    )


@router.patch("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_customers(
    payload: ReorderCustomersRequest,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_editor(role)

    customers = {
        c.id: c for c in await db.scalars(select(Customer).where(Customer.workspace_id == workspace.id))
    }
    if set(payload.customer_ids) != set(customers.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="customer_ids must list every customer in the workspace exactly once",
        )

    for position, customer_id in enumerate(payload.customer_ids):
        customers[customer_id].sort_order = position
    await db.commit()
