# SnapLedger

Freight-forwarding CRM. Next.js (App Router) frontend + FastAPI backend, Postgres (Neon) database. Monorepo: `frontend/` and `backend/` are independent apps with their own dependencies, tests, and Vercel deployments — see `frontend/CLAUDE.md` and `backend/AGENTS.md` for stack-specific conventions.

## Before you build something

- Check whether it already exists first. This codebase already has patterns for auth, workspace-scoped CRUD, bulk operations, file upload + AI extraction, and a dashboard — look at an existing router/page before writing a new one from scratch.
- For anything bigger than a small fix: say what the feature needs to do and what "done" looks like (fields, who's allowed to do it, what happens on bad input) before writing code. Catches missing requirements before they become rework.
- Don't add dependencies, abstractions, or config options the task doesn't need.

## Secrets

- Real credentials live in `.env` (gitignored) locally, and in each platform's own env var store in production (Vercel, for both the `frontend` and `backend` projects). Never put a real secret in a committed file, a log, or a script written to disk.
- `NEXT_PUBLIC_*` vars are inlined into the frontend's browser bundle at build time — only put things there that are safe to ship to a browser.

## Deployment

- `frontend` and `backend` are separate Vercel projects in this same repo (different root directories), each with its own env vars, each auto-deploying on push to `main`. The backend's Vercel Function is pinned to `syd1` (Sydney) in `backend/vercel.json` — keep it there, it's the same region as the Neon database.
- Pushing to `main` deploys both projects, but not necessarily at the same moment. If a frontend change depends on a backend change (e.g. a new endpoint it calls), land and verify the backend side first — a frontend that's ahead of the backend it's calling will break for real users.

## Validation

```bash
make test   # full suite: backend pytest+ruff, frontend lint+test+build, via docker compose
```

Or individually — see `backend/AGENTS.md` / `frontend/CLAUDE.md` for the exact commands. CI (`.github/workflows/ci.yml`) runs the same checks on every push and PR to `main`.

## Git

- Commit messages: imperative, explain *why* a change was made, not what the diff already shows. Match the existing style (`git log`).
- Prefer separate commits for separable changes over one grab-bag commit.
