import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.ledgers import (
    MAX_LEDGER_MEMBERS,
    count_active_members,
    list_user_ledgers,
    require_owner,
    resolve_ledger_membership,
)
from app.models import Ledger, LedgerInvite, LedgerMember, LedgerRole, MemberStatus, User
from app.schemas import (
    AcceptInviteResponse,
    CreateInviteRequest,
    InviteOut,
    LedgerMemberOut,
    LedgerOut,
    UpdateMemberRoleRequest,
)

router = APIRouter(prefix="/ledgers", tags=["ledgers"])


@router.get("", response_model=list[LedgerOut])
async def list_ledgers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ledgers = await list_user_ledgers(db, current_user)
    return [LedgerOut(id=ledger.id, name=ledger.name, role=role.value) for ledger, role in ledgers]


@router.get("/{ledger_id}/members", response_model=list[LedgerMemberOut])
async def list_members(
    ledger_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await resolve_ledger_membership(db, current_user, ledger_id)  # any active member can view

    result = await db.execute(
        select(LedgerMember, User)
        .join(User, User.id == LedgerMember.user_id)
        .where(LedgerMember.ledger_id == ledger_id, LedgerMember.status == MemberStatus.active)
        .order_by(LedgerMember.joined_at)
    )
    return [
        LedgerMemberOut(
            user_id=user.id, email=user.email, name=user.name, role=member.role.value, joined_at=member.joined_at
        )
        for member, user in result.all()
    ]


@router.post("/{ledger_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    ledger_id: int,
    payload: CreateInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, role = await resolve_ledger_membership(db, current_user, ledger_id)
    require_owner(role)

    if await count_active_members(db, ledger_id) >= MAX_LEDGER_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Ledger already has the maximum of {MAX_LEDGER_MEMBERS} members"
        )

    invite = LedgerInvite(
        ledger_id=ledger_id,
        invite_code=secrets.token_urlsafe(16),
        role=LedgerRole(payload.role),
        created_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    return InviteOut(id=invite.id, invite_code=invite.invite_code, role=invite.role.value, expires_at=invite.expires_at)


@router.post("/invites/{code}/accept", response_model=AcceptInviteResponse)
async def accept_invite(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite = await db.scalar(select(LedgerInvite).where(LedgerInvite.invite_code == code))
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.used_by is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite already used")
    # SQLite (used in tests) drops tzinfo on round-trip even for DateTime(timezone=True)
    # columns, unlike Postgres — normalize before comparing so this works on both.
    expires_at = invite.expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is not None and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite has expired")

    existing = await db.scalar(
        select(LedgerMember).where(
            LedgerMember.ledger_id == invite.ledger_id, LedgerMember.user_id == current_user.id
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this ledger")

    if await count_active_members(db, invite.ledger_id) >= MAX_LEDGER_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"Ledger already has the maximum of {MAX_LEDGER_MEMBERS} members"
        )

    ledger = await db.get(Ledger, invite.ledger_id)

    db.add(
        LedgerMember(
            ledger_id=invite.ledger_id,
            user_id=current_user.id,
            role=invite.role,
            status=MemberStatus.active,
            invited_by=invite.created_by,
            joined_at=datetime.now(timezone.utc),
        )
    )
    invite.used_by = current_user.id
    invite.used_at = datetime.now(timezone.utc)
    try:
        await db.commit()
    except IntegrityError:
        # DB-level backstop: two concurrent accepts of the same still-valid invite
        # link (or two invites) both passing the "not already a member" check above
        # before either committed.
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this ledger")

    return AcceptInviteResponse(ledger_id=ledger.id, ledger_name=ledger.name, role=invite.role.value)


@router.patch("/{ledger_id}/members/{user_id}", response_model=LedgerMemberOut)
async def update_member_role(
    ledger_id: int,
    user_id: int,
    payload: UpdateMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, role = await resolve_ledger_membership(db, current_user, ledger_id)
    require_owner(role)
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot change their own role")

    member = await db.scalar(
        select(LedgerMember).where(
            LedgerMember.ledger_id == ledger_id,
            LedgerMember.user_id == user_id,
            LedgerMember.status == MemberStatus.active,
        )
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    member.role = LedgerRole(payload.role)
    await db.commit()

    user = await db.get(User, user_id)
    return LedgerMemberOut(
        user_id=user.id, email=user.email, name=user.name, role=member.role.value, joined_at=member.joined_at
    )


@router.delete("/{ledger_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    ledger_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, role = await resolve_ledger_membership(db, current_user, ledger_id)
    if user_id == current_user.id:
        if role == LedgerRole.owner:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot leave their own ledger")
    else:
        require_owner(role)

    member = await db.scalar(
        select(LedgerMember).where(
            LedgerMember.ledger_id == ledger_id,
            LedgerMember.user_id == user_id,
            LedgerMember.status == MemberStatus.active,
        )
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.delete(member)
    await db.commit()
