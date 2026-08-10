# SnapLedger

AI-powered personal expense tracker. Snap a receipt photo, get it auto-parsed and logged, share a ledger with up to 5 people.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16.3.0 · React 19.2.8 · TypeScript · Tailwind CSS 4 |
| Backend | FastAPI 0.115.0 · Python 3.12 · Uvicorn 0.32.0 |
| Database | PostgreSQL (Neon, managed) |
| Cache | Redis 7 |
| AI | Gemini API |
| Image storage | Cloudinary |
| Auth | Google OAuth |
| Runtime | Docker 29.6.2 · Docker Compose v5.3.1 |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)

No local Node.js or Python install required — everything runs in containers.

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

3. Build and start all services
   ```bash
   docker compose up --build
   ```

4. Verify
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend health check: [http://localhost:8000/health](http://localhost:8000/health) → `{"status": "ok"}`

## Daily use

```bash
docker compose up          # start (no rebuild)
docker compose up --build  # rebuild after changing requirements.txt / package.json
docker compose down        # stop
docker compose logs -f backend   # tail backend logs
docker compose exec backend bash # shell into backend container
```
