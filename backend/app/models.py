import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LedgerRole(str, enum.Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class MemberStatus(str, enum.Enum):
    invited = "invited"
    active = "active"


class ReceiptStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    name: Mapped[str | None] = mapped_column(String(255))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    base_currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owned_ledgers: Mapped[list["Ledger"]] = relationship(back_populates="owner")
    memberships: Mapped[list["LedgerMember"]] = relationship(
        back_populates="user", foreign_keys="LedgerMember.user_id"
    )


class Ledger(Base):
    __tablename__ = "ledgers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="owned_ledgers")
    members: Mapped[list["LedgerMember"]] = relationship(back_populates="ledger")
    categories: Mapped[list["Category"]] = relationship(back_populates="ledger")


class LedgerMember(Base):
    __tablename__ = "ledger_members"
    __table_args__ = (UniqueConstraint("ledger_id", "user_id", name="uq_ledger_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[LedgerRole] = mapped_column(Enum(LedgerRole, name="ledger_role"), nullable=False)
    status: Mapped[MemberStatus] = mapped_column(
        Enum(MemberStatus, name="member_status"), default=MemberStatus.active
    )
    invited_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    ledger: Mapped["Ledger"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships", foreign_keys=[user_id])


class LedgerInvite(Base):
    __tablename__ = "ledger_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    role: Mapped[LedgerRole] = mapped_column(Enum(LedgerRole, name="ledger_role"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    icon: Mapped[str | None] = mapped_column(String(50))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    ledger: Mapped["Ledger"] = relationship(back_populates="categories")


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    extracted_merchant: Mapped[str | None] = mapped_column(String(255))
    extracted_date: Mapped[date | None] = mapped_column(Date)
    extracted_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    extracted_currency: Mapped[str | None] = mapped_column(String(3))
    extracted_category: Mapped[str | None] = mapped_column(String(100))
    ocr_raw_json: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[ReceiptStatus] = mapped_column(
        Enum(ReceiptStatus, name="receipt_status"), default=ReceiptStatus.pending
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    merchant: Mapped[str | None] = mapped_column(String(255))
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    # unique: DB-level backstop against the confirm_receipt race (two concurrent
    # confirms both passing the pending-status check before either commits) —
    # one receipt can back at most one transaction.
    receipt_id: Mapped[int | None] = mapped_column(ForeignKey("receipts.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    category: Mapped["Category | None"] = relationship()
    receipt: Mapped["Receipt | None"] = relationship()
