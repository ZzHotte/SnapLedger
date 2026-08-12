from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str | None
    avatar_url: str | None
    base_currency: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LedgerOut(BaseModel):
    id: int
    name: str
    role: str


class LedgerMemberOut(BaseModel):
    user_id: int
    email: str
    name: str | None
    role: str
    joined_at: datetime | None


class CreateInviteRequest(BaseModel):
    role: str = Field(pattern="^(editor|viewer)$")
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InviteOut(BaseModel):
    id: int
    invite_code: str
    role: str
    expires_at: datetime | None


class AcceptInviteResponse(BaseModel):
    ledger_id: int
    ledger_name: str
    role: str


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(pattern="^(editor|viewer)$")


class ReceiptOut(BaseModel):
    id: int
    image_url: str
    status: str
    merchant: str | None
    transaction_date: date | None
    amount: float | None
    currency: str | None
    category: str | None


class ConfirmReceiptRequest(BaseModel):
    merchant: str | None = Field(default=None, max_length=255)
    transaction_date: date
    amount: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    category: str
    note: str | None = Field(default=None, max_length=500)


class TransactionOut(BaseModel):
    id: int
    amount: float
    currency: str
    merchant: str | None
    transaction_date: date
    category: str | None
    receipt_image_url: str | None
    created_at: datetime
