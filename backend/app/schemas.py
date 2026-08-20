from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


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


class WorkspaceOut(BaseModel):
    id: int
    name: str
    role: str


class WorkspaceMemberOut(BaseModel):
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
    workspace_id: int
    workspace_name: str
    role: str


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(pattern="^(editor|viewer)$")


class CustomerOut(BaseModel):
    id: int
    name: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None


class CreateCustomerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    contact_name: str | None = Field(default=None, max_length=255)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)


class CarrierOut(BaseModel):
    id: int
    name: str
    mode: str
    contact_email: str | None


class CreateCarrierRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    mode: str = Field(pattern="^(FCL|LCL|AIR|RAIL|ROAD)$")
    contact_email: EmailStr | None = None


class DocumentOut(BaseModel):
    id: int
    file_url: str
    status: str
    doc_type: str | None
    bl_number: str | None
    shipper: str | None
    consignee: str | None
    origin_port: str | None
    destination_port: str | None
    cargo_description: str | None
    weight_kg: float | None
    freight_cost: float | None
    currency: str | None
    extraction_failed: bool


class ShipmentInput(BaseModel):
    customer_id: int
    carrier_id: int | None = None
    freight_mode: str = Field(pattern="^(FCL|LCL|AIR|RAIL|ROAD)$")
    origin_port: str | None = Field(default=None, max_length=255)
    destination_port: str | None = Field(default=None, max_length=255)
    cargo_description: str | None = Field(default=None, max_length=500)
    container_no: str | None = Field(default=None, max_length=50)
    weight_kg: float | None = Field(default=None, gt=0)
    freight_cost: float | None = Field(default=None, gt=0)
    currency: str = Field(min_length=3, max_length=3)
    shipment_date: date
    eta: date | None = None
    note: str | None = Field(default=None, max_length=500)


class ConfirmDocumentRequest(ShipmentInput):
    pass


class CreateShipmentRequest(ShipmentInput):
    pass


class ShipmentOut(BaseModel):
    id: int
    customer_name: str | None
    carrier_name: str | None
    freight_mode: str
    origin_port: str | None
    destination_port: str | None
    cargo_description: str | None
    container_no: str | None
    weight_kg: float | None
    freight_cost: float | None
    currency: str
    status: str
    shipment_date: date
    eta: date | None
    document_file_url: str | None
    created_at: datetime


class ShipmentListOut(BaseModel):
    items: list[ShipmentOut]
    total: int


class UpdateShipmentStatusRequest(BaseModel):
    status: str = Field(
        pattern="^(inquiry|quoted|booked|in_transit|arrived|customs|delivered|cancelled)$"
    )


class GenerateMockDataResponse(BaseModel):
    created: int


class BulkIdsRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)


class BulkStatusRequest(BulkIdsRequest):
    status: str = Field(
        pattern="^(inquiry|quoted|booked|in_transit|arrived|customs|delivered|cancelled)$"
    )


class BulkDatesRequest(BulkIdsRequest):
    shipment_date: date | None = None
    eta: date | None = None

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "BulkDatesRequest":
        if self.shipment_date is None and self.eta is None:
            raise ValueError("Provide at least one of shipment_date or eta")
        return self


class BulkUpdateResponse(BaseModel):
    updated: int


class BulkDeleteResponse(BaseModel):
    deleted: int


class QuoteOut(BaseModel):
    id: int
    carrier_name: str
    amount: float
    currency: str
    valid_until: date | None
    status: str
    created_at: datetime


class CreateQuoteRequest(BaseModel):
    carrier_id: int
    amount: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)
    valid_until: date | None = None


class TrackingEventOut(BaseModel):
    id: int
    status: str
    location: str | None
    event_date: date
    note: str | None


class CreateTrackingEventRequest(BaseModel):
    status: str = Field(
        pattern="^(inquiry|quoted|booked|in_transit|arrived|customs|delivered|cancelled)$"
    )
    location: str | None = Field(default=None, max_length=255)
    event_date: date
    note: str | None = Field(default=None, max_length=500)


class ShipmentDetailOut(ShipmentOut):
    quotes: list[QuoteOut]
    tracking_events: list[TrackingEventOut]


STATUS_LIST = [
    "inquiry",
    "quoted",
    "booked",
    "in_transit",
    "arrived",
    "customs",
    "delivered",
    "cancelled",
]

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


class MoneyAmount(BaseModel):
    currency: str
    amount: float


class StatusBreakdown(BaseModel):
    status: str
    count: int
    amounts: list[MoneyAmount]


class MonthlyShipmentCount(BaseModel):
    month: str
    count: int
    amounts: list[MoneyAmount]


class TopCustomer(BaseModel):
    customer_name: str
    shipment_count: int
    amounts: list[MoneyAmount]


class DashboardSummary(BaseModel):
    month: str
    total_shipments: int
    total_amounts: list[MoneyAmount]
    status_breakdown: list[StatusBreakdown]
    monthly_trend: list[MonthlyShipmentCount]
    top_customers: list[TopCustomer]


class ExchangeRateOut(BaseModel):
    base: str
    target: str
    rate: float
    fetched_at: datetime


class BankRateOut(BaseModel):
    country: str
    bank_name: str
    product_type: str
    term_months: int | None
    rate: float
    source_url: str | None


class MacroIndicatorOut(BaseModel):
    country: str
    indicator: str
    value: float
    year: int | None
    source: str
    fetched_at: datetime
