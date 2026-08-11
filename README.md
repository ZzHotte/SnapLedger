# SnapLedger

[![CI](https://github.com/ZzHotte/SnapLedger/actions/workflows/ci.yml/badge.svg)](https://github.com/ZzHotte/SnapLedger/actions/workflows/ci.yml)

Lightweight personal expense tracking and financial planning app that makes everyday budgeting easier. Simply snap a photo of a receipt and let AI extract key transaction details for review and quick logging. Create personal or shared ledgers with up to five friends or family members, track spending patterns through interactive summaries, and gain clearer insights into where your money goes.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16.3.0 · React 19.2.8 · TypeScript · Tailwind CSS 4 |
| Backend | FastAPI 0.115.0 · Python 3.12 · Uvicorn 0.32.0 |
| Database | PostgreSQL (Neon, managed) |
| Cache | Redis 7 |
| AI | Gemini API |
| Image storage | Cloudinary |
| Auth | Google OAuth · Email/password (JWT) |
| Runtime | Docker 29.6.2 · Docker Compose v5.3.1 |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)


## Setup

1. Clone the repo and enter the project directory
   ```bash
   git clone https://github.com/ZzHotte/SnapLedger.git && cd SnapLedger
   ```

2. Copy the env template and fill in real credentials
   ```bash
   cp .env.example .env
   ```
   Fill in `DATABASE_URL` (Neon), `GEMINI_API_KEY`, `CLOUDINARY_*`, and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. See comments in `.env.example` for where to get each value.

3. Start everything once to build the images
   ```bash
   make up &      # terminal 1 (infra: redis)
   make backend   # terminal 2
   make frontend  # terminal 3
   ```

4. Verify
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend health check: [http://localhost:8000/health](http://localhost:8000/health) → `{"status": "ok"}`

## Daily use

Four terminals, each owning one job — restarting/rebuilding one never touches the others:

| Terminal | Command | Purpose |
|---|---|---|
| 1 | `make up` | Steady-state infra (redis). Leave running. |
| 2 | `make backend` | FastAPI, `--reload` on. Ctrl+C / rerun to restart, rebuilds on `requirements.txt` changes. |
| 3 | `make frontend` | Next.js dev server. Ctrl+C / rerun to restart, rebuilds on `package.json` changes. |
| 4 | `make test` | One-shot: pytest + ruff + eslint + Next build — same checks CI runs. |

Other handy commands: `docker compose logs -f backend`, `docker compose exec backend bash`, `docker compose down` (stops everything).

CI (`.github/workflows/ci.yml`) runs the same checks as `make test` on every push/PR to `main`.
