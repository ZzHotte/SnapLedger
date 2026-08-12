.PHONY: build backend frontend test down logs

# First-time setup (or after a Dockerfile change) — builds backend + frontend images.
# `make backend` / `make frontend` also auto-build on first run, this just does both up front.
build:
	docker compose --profile dev build

# Terminal 1 (infra, leave running) is just `docker compose up` — backend/frontend are
# gated behind the "dev" profile, so that alone only starts redis. No make target for
# it since it wouldn't save you anything over typing the compose command directly.

# Terminal 2 — backend, restart/rebuild independently here
backend:
	docker compose up --build backend

# Terminal 3 — frontend, restart/rebuild independently here
frontend:
	docker compose up --build frontend

# Terminal 4 — one-shot: same checks CI runs
# (backend image only ships production deps; make sure dev/test tools are
# there too — a no-op after the first run unless requirements-dev.txt changed)
test:
	docker compose exec backend pip install -q -r requirements-dev.txt
	docker compose exec backend pytest -v
	docker compose exec backend ruff check .
	docker compose exec frontend npm run lint
	docker compose exec frontend npm test
	docker compose exec frontend npm run build

down:
	docker compose down

logs:
	docker compose logs -f
