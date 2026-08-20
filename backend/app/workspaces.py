from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MemberStatus, User, Workspace, WorkspaceMember, WorkspaceRole

MAX_WORKSPACE_MEMBERS = 5


async def resolve_workspace_membership(
    db: AsyncSession, user: User, workspace_id: int | None
) -> tuple[Workspace, WorkspaceRole]:
    """Resolve which workspace a request operates against and the caller's role in it.

    With no workspace_id (the default before workspace-switching UI sends one explicitly),
    falls back to the user's own personal workspace. A workspace_id the user isn't an active
    member of 404s rather than 403s, so membership can't be probed by ID.
    """
    query = select(WorkspaceMember).where(
        WorkspaceMember.user_id == user.id, WorkspaceMember.status == MemberStatus.active
    )
    if workspace_id is None:
        # Every user currently has exactly one owner-role membership (created at
        # registration; no code path grants a second one — invite/role-update
        # roles are restricted to editor/viewer). This ordering is a defensive
        # tiebreaker, not a real disambiguation: if a future feature ever lets a
        # user own more than one workspace, callers that omit workspace_id here
        # need to be revisited rather than silently landing on an arbitrary one.
        query = query.where(WorkspaceMember.role == WorkspaceRole.owner).order_by(WorkspaceMember.id)
    else:
        query = query.where(WorkspaceMember.workspace_id == workspace_id)

    member = await db.scalar(query)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    workspace = await db.get(Workspace, member.workspace_id)
    return workspace, member.role


def require_editor(role: WorkspaceRole) -> None:
    if role == WorkspaceRole.viewer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Viewers cannot make changes to this workspace"
        )


def require_owner(role: WorkspaceRole) -> None:
    if role != WorkspaceRole.owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only the workspace owner can do this"
        )


async def count_active_members(db: AsyncSession, workspace_id: int) -> int:
    return await db.scalar(
        select(func.count())
        .select_from(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.status == MemberStatus.active)
    )


async def ensure_capacity(db: AsyncSession, workspace_id: int) -> None:
    if await count_active_members(db, workspace_id) >= MAX_WORKSPACE_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workspace already has the maximum of {MAX_WORKSPACE_MEMBERS} members",
        )


async def get_active_member(db: AsyncSession, workspace_id: int, user_id: int) -> WorkspaceMember | None:
    return await db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == MemberStatus.active,
        )
    )


async def list_user_workspaces(db: AsyncSession, user: User) -> list[tuple[Workspace, WorkspaceRole]]:
    result = await db.execute(
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == MemberStatus.active)
        .order_by(Workspace.created_at)
    )
    return [(workspace, role) for workspace, role in result.all()]
