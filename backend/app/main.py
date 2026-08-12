from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, receipts, transactions

settings = get_settings()

app = FastAPI(title="SnapLedger API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(receipts.router)
app.include_router(transactions.router)


@app.get("/health")
def health():
    return {"status": "ok"}
