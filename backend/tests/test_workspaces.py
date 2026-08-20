from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.models import MemberStatus, User, Workspace, WorkspaceMember, WorkspaceRole
from app.workspaces import list_user_workspaces, require_editor, resolve_workspace_membership


async def _make_user_with_workspace(db_session):
    user = User(email="workspacetest@example.com", password_hash="x")
    db_session.add(user)
    await db_session.flush()

    workspace = Workspace(name="My Freight Team", owner_id=user.id)
    db_session.add(workspace)
    await db_session.flush()

    db_session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.owner,
            status=MemberStatus.active,
            joined_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(workspace)
    return user, workspace


async def _add_member(db_session, workspace, email, role):
    user = User(email=email, password_hash="x")
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=role,
            status=MemberStatus.active,
            joined_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_resolve_workspace_membership_defaults_to_owned_workspace(db_session):
    user, workspace = await _make_user_with_workspace(db_session)
    found, role = await resolve_workspace_membership(db_session, user, workspace_id=None)
    assert found.id == workspace.id
    assert role == WorkspaceRole.owner


async def test_resolve_workspace_membership_404s_when_user_has_no_workspace(db_session):
    user = User(email="noworkspace@example.com", password_hash="x")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    with pytest.raises(HTTPException) as exc_info:
        await resolve_workspace_membership(db_session, user, workspace_id=None)
    assert exc_info.value.status_code == 404


async def test_resolve_workspace_membership_by_id_returns_caller_role(db_session):
    owner, workspace = await _make_user_with_workspace(db_session)
    viewer = await _add_member(db_session, workspace, "viewer@example.com", WorkspaceRole.viewer)

    found, role = await resolve_workspace_membership(db_session, viewer, workspace_id=workspace.id)
    assert found.id == workspace.id
    assert role == WorkspaceRole.viewer


async def test_resolve_workspace_membership_404s_for_workspace_caller_is_not_a_member_of(db_session):
    _, workspace = await _make_user_with_workspace(db_session)
    outsider = User(email="outsider@example.com", password_hash="x")
    db_session.add(outsider)
    await db_session.commit()
    await db_session.refresh(outsider)

    with pytest.raises(HTTPException) as exc_info:
        await resolve_workspace_membership(db_session, outsider, workspace_id=workspace.id)
    assert exc_info.value.status_code == 404


def test_require_editor_allows_owner_and_editor():
    require_editor(WorkspaceRole.owner)
    require_editor(WorkspaceRole.editor)


def test_require_editor_blocks_viewer():
    with pytest.raises(HTTPException) as exc_info:
        require_editor(WorkspaceRole.viewer)
    assert exc_info.value.status_code == 403


async def test_list_user_workspaces_returns_active_memberships_with_roles(db_session):
    owner, workspace = await _make_user_with_workspace(db_session)
    await _add_member(db_session, workspace, "editor@example.com", WorkspaceRole.editor)

    workspaces = await list_user_workspaces(db_session, owner)
    assert [(w.id, role) for w, role in workspaces] == [(workspace.id, WorkspaceRole.owner)]
