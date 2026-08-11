.PHONY: up backend frontend test down logs

# Terminal 1 — steady-state infra, keep running
up:
	docker compose up

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
	docker compose exec frontend npm run build

down:
	docker compose down

logs:
	docker compose logs -f
