from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, carriers, customers, dashboard, documents, market_data, shipments, workspaces

settings = get_settings()

app = FastAPI(title="SnapLedger Freight CRM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(customers.router)
app.include_router(carriers.router)
app.include_router(documents.router)
app.include_router(shipments.router)
app.include_router(dashboard.router)
app.include_router(market_data.router)


@app.get("/health")
def health():
    return {"status": "ok"}
