from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import Customer, User
from app.schemas import CreateCustomerRequest, CustomerOut, ReorderCustomersRequest
from app.workspaces import require_editor, resolve_workspace_membership

router = APIRouter(prefix="/customers", tags=["customers"])


def _to_customer_out(c: Customer) -> CustomerOut:
    return CustomerOut(
        id=c.id, name=c.name, contact_name=c.contact_name, contact_email=c.contact_email, contact_phone=c.contact_phone
    )


async def _get_customer_or_404(db: AsyncSession, workspace_id: int, customer_id: int) -> Customer:
    customer = await db.get(Customer, customer_id)
    if customer is None or customer.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


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
    return [_to_customer_out(c) for c in result.all()]


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: int,
    workspace_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace, _role = await resolve_workspace_membership(db, current_user, workspace_id)
    customer = await _get_customer_or_404(db, workspace.id, customer_id)
    return _to_customer_out(customer)


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

    return _to_customer_out(customer)


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
