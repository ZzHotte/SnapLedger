import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class WorkspaceRole(str, enum.Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class MemberStatus(str, enum.Enum):
    invited = "invited"
    active = "active"


class DocumentStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class FreightMode(str, enum.Enum):
    # Member names match their values (unlike the lowercase snake_case enums
    # below) so SQLAlchemy's default name-based Enum storage round-trips
    # correctly against the freight_mode Postgres type, whose labels are the
    # uppercase acronyms themselves ('FCL', not 'fcl').
    FCL = "FCL"
    LCL = "LCL"
    AIR = "AIR"
    RAIL = "RAIL"
    ROAD = "ROAD"


class ShipmentStatus(str, enum.Enum):
    inquiry = "inquiry"
    quoted = "quoted"
    booked = "booked"
    in_transit = "in_transit"
    arrived = "arrived"
    customs = "customs"
    delivered = "delivered"
    cancelled = "cancelled"


class QuoteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
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

    owned_workspaces: Mapped[list["Workspace"]] = relationship(back_populates="owner")
    memberships: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="user", foreign_keys="WorkspaceMember.user_id"
    )


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="owned_workspaces")
    members: Mapped[list["WorkspaceMember"]] = relationship(back_populates="workspace")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(Enum(WorkspaceRole, name="workspace_role"), nullable=False)
    status: Mapped[MemberStatus] = mapped_column(
        Enum(MemberStatus, name="member_status"), default=MemberStatus.active
    )
    invited_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    workspace: Mapped["Workspace"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships", foreign_keys=[user_id])


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    role: Mapped[WorkspaceRole] = mapped_column(Enum(WorkspaceRole, name="workspace_role"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Carrier(Base):
    __tablename__ = "carriers"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    mode: Mapped[FreightMode] = mapped_column(Enum(FreightMode, name="freight_mode"), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    file_url: Mapped[str] = mapped_column(String(500), nullable=False)
    extracted_doc_type: Mapped[str | None] = mapped_column(String(50))
    extracted_bl_number: Mapped[str | None] = mapped_column(String(100))
    extracted_shipper: Mapped[str | None] = mapped_column(String(255))
    extracted_consignee: Mapped[str | None] = mapped_column(String(255))
    extracted_port_of_loading: Mapped[str | None] = mapped_column(String(255))
    extracted_port_of_discharge: Mapped[str | None] = mapped_column(String(255))
    extracted_cargo_description: Mapped[str | None] = mapped_column(String(500))
    extracted_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    ocr_raw_json: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"), default=DocumentStatus.pending
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Shipment(Base):
    __tablename__ = "shipments"
    # Backs both the paginated list (WHERE workspace_id=? ORDER BY shipment_date)
    # and the dashboard's WHERE workspace_id=? AND shipment_date BETWEEN ? AND ?
    # — without it both do a full table scan once a workspace reaches mock-data scale.
    __table_args__ = (Index("ix_shipments_workspace_date", "workspace_id", "shipment_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    carrier_id: Mapped[int | None] = mapped_column(ForeignKey("carriers.id"))
    freight_mode: Mapped[FreightMode] = mapped_column(Enum(FreightMode, name="freight_mode"), nullable=False)
    origin_port: Mapped[str | None] = mapped_column(String(255))
    destination_port: Mapped[str | None] = mapped_column(String(255))
    cargo_description: Mapped[str | None] = mapped_column(String(500))
    container_no: Mapped[str | None] = mapped_column(String(50))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    freight_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[ShipmentStatus] = mapped_column(
        Enum(ShipmentStatus, name="shipment_status"), default=ShipmentStatus.inquiry
    )
    shipment_date: Mapped[date] = mapped_column(Date, nullable=False)
    eta: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(500))
    # unique: DB-level backstop against the confirm_document race (two concurrent
    # confirms both passing the pending-status check before either commits) —
    # one document can back at most one shipment.
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer | None"] = relationship()
    carrier: Mapped["Carrier | None"] = relationship()
    document: Mapped["Document | None"] = relationship()
    quotes: Mapped[list["Quote"]] = relationship(back_populates="shipment")
    tracking_events: Mapped[list["TrackingEvent"]] = relationship(back_populates="shipment")


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"), nullable=False)
    carrier_id: Mapped[int] = mapped_column(ForeignKey("carriers.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    status: Mapped[QuoteStatus] = mapped_column(Enum(QuoteStatus, name="quote_status"), default=QuoteStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    shipment: Mapped["Shipment"] = relationship(back_populates="quotes")
    carrier: Mapped["Carrier"] = relationship()


class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id"), nullable=False)
    status: Mapped[ShipmentStatus] = mapped_column(Enum(ShipmentStatus, name="shipment_status"), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    shipment: Mapped["Shipment"] = relationship(back_populates="tracking_events")


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (UniqueConstraint("base_currency", "target_currency", name="uq_exchange_rate_pair"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    target_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class BankRate(Base):
    __tablename__ = "bank_rates"

    id: Mapped[int] = mapped_column(primary_key=True)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    product_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "demand" | "term"
    term_months: Mapped[int | None] = mapped_column(Integer)
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MacroIndicator(Base):
    __tablename__ = "macro_indicators"
    # One row per (country, indicator) holding the latest known value rather than
    # a full year-over-year history — this panel is a "current reference" card,
    # not a trend chart, so there's nothing to gain from keeping old rows around.
    __table_args__ = (UniqueConstraint("country_code", "indicator", name="uq_macro_indicator_country"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False)
    indicator: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
