# Backend (FastAPI + SQLAlchemy async + Postgres/Neon)

## Layout

- `app/routers/*.py` — one file per resource (`auth`, `shipments`, `workspaces`, …), each a FastAPI `APIRouter`.
- `app/models.py` — all SQLAlchemy ORM models in one file.
- `app/schemas.py` — all Pydantic request/response schemas in one file.
- `app/workspaces.py` — shared authorization helpers. Every workspace-scoped endpoint starts with `resolve_workspace_membership(db, current_user, workspace_id)`, then `require_editor(role)` or `require_owner(role)` for mutations. Reuse these — don't write a one-off permission check in a router.
- `app/security.py` — password hashing (bcrypt) and JWT. `app/database.py` — engine/session. `app/config.py` — `Settings`, read from `.env` via pydantic-settings.

## Database session conventions

- The session is `expire_on_commit=False` (`app/database.py`). After `await db.commit()`, attributes you already set in Python — and relationships you eager-loaded with `selectinload`/`joinedload` before the commit — are still valid. Postgres's implicit `RETURNING` already fills in server-generated columns (`id`, `server_default` columns like `created_at`) on insert. **Don't add `await db.refresh(...)` after a commit "to be safe"** — it's a real extra network round trip (~150-200ms to Neon, measured), and almost never actually needed. Check what the response model uses before deciding you need one.
- Prefer one query over two where it's a straightforward join — e.g. fetching a user and their workspace list together rather than one lookup followed by a second. Each round trip to Neon costs real, measurable latency.
- Race conditions on a unique constraint (two requests both passing a check before either commits) are handled by committing and catching `IntegrityError`, not a pre-check-then-insert. See `workspaces.py::accept_invite` or `documents.py::confirm_document` for the pattern.

## Testing

- `tests/` mirrors the routers fairly closely (`test_shipments.py`, `test_workspaces_api.py`, …), using the `client` fixture from `conftest.py` (an `AsyncClient` against an in-memory SQLite DB, not the real Postgres). Look at an existing test in the same area before adding a new one.

## Validation

```bash
pytest -v
ruff check .
```

Both also run in CI. Local dev: `docker compose up backend` (equivalent to `make backend` from the repo root) — runs with `--reload` against `.env`.
