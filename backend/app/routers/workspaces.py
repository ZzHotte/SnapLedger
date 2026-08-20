import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import MemberStatus, User, Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceRole
from app.schemas import (
    AcceptInviteResponse,
    CreateInviteRequest,
    InviteOut,
    UpdateMemberRoleRequest,
    WorkspaceMemberOut,
    WorkspaceOut,
)
from app.workspaces import (
    ensure_capacity,
    get_active_member,
    list_user_workspaces,
    require_owner,
    resolve_workspace_membership,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceOut])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspaces = await list_user_workspaces(db, current_user)
    return [WorkspaceOut(id=w.id, name=w.name, role=role.value) for w, role in workspaces]


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberOut])
async def list_members(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await resolve_workspace_membership(db, current_user, workspace_id)  # any active member can view

    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.status == MemberStatus.active)
        .order_by(WorkspaceMember.joined_at)
    )
    return [
        WorkspaceMemberOut(
            user_id=user.id, email=user.email, name=user.name, role=member.role.value, joined_at=member.joined_at
        )
        for member, user in result.all()
    ]


@router.post("/{workspace_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED)
async def create_invite(
    workspace_id: int,
    payload: CreateInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_owner(role)
    # Best-effort fail-fast check — not lock-protected, since generating an invite
    # doesn't itself create a membership. The capacity limit is actually enforced
    # atomically in accept_invite, where the membership row gets created.
    await ensure_capacity(db, workspace_id)

    invite = WorkspaceInvite(
        workspace_id=workspace_id,
        invite_code=secrets.token_urlsafe(16),
        role=WorkspaceRole(payload.role),
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
    invite = await db.scalar(select(WorkspaceInvite).where(WorkspaceInvite.invite_code == code))
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
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == invite.workspace_id, WorkspaceMember.user_id == current_user.id
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this workspace")

    # Lock the workspace row so concurrent accepts for the same workspace serialize
    # on this line: the count check below plus the membership insert are otherwise a
    # check-then-act with no unique constraint backing the *count* (only
    # uq_workspace_member, which just stops the same user joining twice) — without
    # the lock, two different users accepting invites at the same moment could
    # both pass the count check and push the workspace past MAX_WORKSPACE_MEMBERS.
    workspace = await db.get(Workspace, invite.workspace_id, with_for_update=True)
    await ensure_capacity(db, invite.workspace_id)

    db.add(
        WorkspaceMember(
            workspace_id=invite.workspace_id,
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this workspace")

    return AcceptInviteResponse(workspace_id=workspace.id, workspace_name=workspace.name, role=invite.role.value)


@router.patch("/{workspace_id}/members/{user_id}", response_model=WorkspaceMemberOut)
async def update_member_role(
    workspace_id: int,
    user_id: int,
    payload: UpdateMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, role = await resolve_workspace_membership(db, current_user, workspace_id)
    require_owner(role)
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot change their own role")

    member = await get_active_member(db, workspace_id, user_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    member.role = WorkspaceRole(payload.role)
    await db.commit()

    user = await db.get(User, user_id)
    return WorkspaceMemberOut(
        user_id=user.id, email=user.email, name=user.name, role=member.role.value, joined_at=member.joined_at
    )


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    workspace_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, role = await resolve_workspace_membership(db, current_user, workspace_id)
    if user_id == current_user.id:
        if role == WorkspaceRole.owner:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot leave their own workspace")
    else:
        require_owner(role)

    member = await get_active_member(db, workspace_id, user_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.delete(member)
    await db.commit()
