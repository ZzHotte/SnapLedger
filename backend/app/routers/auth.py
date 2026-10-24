import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import bearer_scheme, get_current_user
from app.google_oauth import build_google_auth_url, exchange_code_for_userinfo
from app.models import MemberStatus, User, Workspace, WorkspaceMember, WorkspaceRole
from app.schemas import LoginRequest, RegisterRequest, SessionResponse, TokenResponse, UserOut, WorkspaceOut
from app.security import create_access_token, decode_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


async def create_personal_workspace(db: AsyncSession, user: User) -> Workspace:
    workspace = Workspace(name="My Freight Team", owner_id=user.id)
    db.add(workspace)
    await db.flush()

    db.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.owner,
            status=MemberStatus.active,
            joined_at=datetime.now(timezone.utc),
        )
    )

    return workspace


async def _user_with_workspaces(
    db: AsyncSession, *, email: str | None = None, user_id: int | None = None
) -> tuple[User, list[WorkspaceOut]] | None:
    """One query for the user plus their active workspace memberships — the
    shape every token-issuing response (register/login/session) needs — instead
    of a user lookup followed by a separate /workspaces-equivalent query. Each
    extra round trip to Neon costs ~150-200ms here, so collapsing two into one
    is a real, measurable chunk of these endpoints' latency, not just tidiness.
    """
    condition = User.email == email if email is not None else User.id == user_id
    rows = (
        await db.execute(
            select(User, Workspace, WorkspaceMember.role)
            .outerjoin(
                WorkspaceMember,
                (WorkspaceMember.user_id == User.id) & (WorkspaceMember.status == MemberStatus.active),
            )
            .outerjoin(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .where(condition)
            .order_by(Workspace.created_at)
        )
    ).all()
    if not rows:
        return None
    user = rows[0][0]
    workspaces = [WorkspaceOut(id=w.id, name=w.name, role=role.value) for _, w, role in rows if w is not None]
    return user, workspaces


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )
    db.add(user)
    try:
        # Flushed here (rather than left to commit's autoflush) because
        # create_personal_workspace needs user.id, and catching the duplicate-
        # email conflict here — same table the constraint lives on — avoids
        # a separate pre-check SELECT on the common (non-duplicate) path.
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    workspace = await create_personal_workspace(db, user)
    await db.commit()

    # The workspace we just created is the only one this brand-new user has —
    # no need to re-query for what's already sitting in `workspace`.
    token = create_access_token(user.id)
    workspaces = [WorkspaceOut(id=workspace.id, name=workspace.name, role=WorkspaceRole.owner.value)]
    return TokenResponse(access_token=token, user=UserOut.model_validate(user), workspaces=workspaces)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    found = await _user_with_workspaces(db, email=payload.email)
    if found is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    user, workspaces = found
    if user.password_hash is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user), workspaces=workspaces)


@router.get("/google/login")
async def google_login():
    state = secrets.token_urlsafe(16)
    return RedirectResponse(build_google_auth_url(state))


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    userinfo = await exchange_code_for_userinfo(code)

    if not userinfo.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google email not verified")

    email = userinfo["email"]
    google_id = userinfo["sub"]

    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            google_id=google_id,
            name=userinfo.get("name"),
            avatar_url=userinfo.get("picture"),
        )
        db.add(user)
        await db.flush()
        await create_personal_workspace(db, user)
    elif user.google_id is None:
        user.google_id = google_id

    await db.commit()

    token = create_access_token(user.id)
    return RedirectResponse(f"{settings.frontend_url}/auth/callback?token={token}")


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.get("/session", response_model=SessionResponse)
async def session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Bundles the user profile and their workspace list in one round trip —
    both are needed before the dashboard can render, and fetching them one
    after the other (as separate /auth/me + /workspaces calls) adds a full
    extra network hop to every page load/OAuth callback. Decodes the token
    directly (rather than depending on get_current_user, which is a separate
    user-only lookup shared by every other router) so that single combined
    query is the only database round trip this endpoint makes."""
    try:
        user_id = decode_access_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    found = await _user_with_workspaces(db, user_id=user_id)
    if found is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    user, workspaces = found
    return SessionResponse(user=UserOut.model_validate(user), workspaces=workspaces)
