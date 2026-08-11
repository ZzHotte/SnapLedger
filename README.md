# SnapLedger

[![CI](https://github.com/ZzHotte/SnapLedger/actions/workflows/ci.yml/badge.svg)](https://github.com/ZzHotte/SnapLedger/actions/workflows/ci.yml)

Lightweight personal expense tracking and financial planning app that makes everyday budgeting easier. Simply snap a photo of a receipt and let AI extract key transaction details for review and quick logging. Create personal or shared ledgers with up to five friends or family members, track spending patterns through interactive summaries, and gain clearer insights into where your money goes.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16.3.0 · React 19.2.8 · TypeScript · Tailwind CSS 4 |
| Backend | FastAPI 0.115.0 · Python 3.12 · Uvicorn 0.32.0 |
| Database | PostgreSQL (Neon) |
| Cache | Redis 7 |
| AI | Gemini API |
| Image Storage | Cloudinary |
| Auth | Google OAuth · Email/password (JWT) |
| Runtime | Docker 29.6.2 · Docker Compose v5.3.1 |

## Getting Started

### Prerequisite

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), which includes Docker Compose.

### 1. Clone the repository

```bash
git clone https://github.com/ZzHotte/SnapLedger.git
cd SnapLedger
````

### 2. Configure environment variables

```Bash
cp .env.example .env
```

Add your credentials to `.env`, including:

* `DATABASE_URL`
* `GEMINI_API_KEY`
* `CLOUDINARY_*`
* `GOOGLE_CLIENT_ID`
* `GOOGLE_CLIENT_SECRET`

See `.env.example` for setup notes.

### 3. Build the project

Only required for the first setup or after changing a Dockerfile.

```Bash
make build
```

### 4. Start the services

Open three terminals:

**Terminal 1**

```Bash
docker compose up
```

**Terminal 2 — Frontend**

```Bash
make frontend
```

Runs the Next.js development server with hot reload.

**Terminal 3 — Backend**

```Bash
make backend
```

Runs FastAPI with `--reload`.

If `package.json` or `requirements.txt` changes, stop and rerun the corresponding command to rebuild the service.

### 5. Run tests

Optional during development:

```Bash
make test
```

This runs the same checks used by CI:

* pytest
* ruff
* eslint
* Next.js build

### 6. Verify

* Frontend: [http://localhost:3000](http://localhost:3000)
* Backend: [http://localhost:8000/health](http://localhost:8000/health)

A successful backend health check returns:

```JSON
{"status": "ok"}
```

## Daily Development

After the initial setup, you normally only need:

```Bash
docker compose up
make frontend
make backend
```

Run tests when needed:

```Bash
make test
```

No rebuild is required unless a Dockerfile changes.

### Useful Commands

```Bash
docker compose logs -f backend
docker compose exec backend bash
docker compose down
```

