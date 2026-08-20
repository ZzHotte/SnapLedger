const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// FastAPI's `detail` is a plain string for most errors, but for 422 validation
// errors it's an array of {loc, msg, type} objects — stringify it properly
// instead of letting it fall through to JS's default Error message coercion
// (which turns an array of objects into the literal text "[object Object]").
function extractErrorMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : String(item)
      )
      .join(", ");
  }
  return "Request failed";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, extractErrorMessage(body.detail));
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Separate from request(): file uploads must NOT set Content-Type manually —
// the browser needs to add its own multipart boundary.
async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, extractErrorMessage(body.detail));
  }

  return res.json();
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  avatar_url: string | null;
  base_currency: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export function registerUser(email: string, password: string, name: string) {
  return request<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: name || undefined }),
  });
}

export function loginUser(email: string, password: string) {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchCurrentUser() {
  return request<User>("/auth/me");
}

export function googleLoginUrl() {
  return `${API_URL}/auth/google/login`;
}

export interface Workspace {
  id: number;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export function fetchWorkspaces() {
  return request<Workspace[]>("/workspaces");
}

export interface WorkspaceMember {
  user_id: number;
  email: string;
  name: string | null;
  role: "owner" | "editor" | "viewer";
  joined_at: string | null;
}

export function fetchWorkspaceMembers(workspaceId: number) {
  return request<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`);
}

export function updateMemberRole(workspaceId: number, userId: number, role: "editor" | "viewer") {
  return request<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeMember(workspaceId: number, userId: number) {
  return request<void>(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" });
}

export interface Invite {
  id: number;
  invite_code: string;
  role: "editor" | "viewer";
  expires_at: string | null;
}

export function createInvite(workspaceId: number, role: "editor" | "viewer") {
  return request<Invite>(`/workspaces/${workspaceId}/invites`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export interface AcceptInviteResult {
  workspace_id: number;
  workspace_name: string;
  role: "owner" | "editor" | "viewer";
}

export function acceptInvite(code: string) {
  return request<AcceptInviteResult>(`/workspaces/invites/${code}/accept`, { method: "POST" });
}

export interface Customer {
  id: number;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export function fetchCustomers(workspaceId: number) {
  return request<Customer[]>(`/customers?workspace_id=${workspaceId}`);
}

export function createCustomer(
  workspaceId: number,
  payload: { name: string; contact_name?: string | null; contact_email?: string | null; contact_phone?: string | null }
) {
  return request<Customer>(`/customers?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface Carrier {
  id: number;
  name: string;
  mode: string;
  contact_email: string | null;
}

export function fetchCarriers(workspaceId: number) {
  return request<Carrier[]>(`/carriers?workspace_id=${workspaceId}`);
}

export function createCarrier(workspaceId: number, payload: { name: string; mode: string; contact_email?: string | null }) {
  return request<Carrier>(`/carriers?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface Document {
  id: number;
  file_url: string;
  status: string;
  doc_type: string | null;
  bl_number: string | null;
  shipper: string | null;
  consignee: string | null;
  origin_port: string | null;
  destination_port: string | null;
  cargo_description: string | null;
  weight_kg: number | null;
  freight_cost: number | null;
  currency: string | null;
  extraction_failed: boolean;
}

export interface ShipmentInput {
  customer_id: number;
  carrier_id?: number | null;
  freight_mode: string;
  origin_port?: string | null;
  destination_port?: string | null;
  cargo_description?: string | null;
  container_no?: string | null;
  weight_kg?: number | null;
  freight_cost?: number | null;
  currency: string;
  shipment_date: string;
  eta?: string | null;
  note?: string | null;
}

export type ConfirmDocumentPayload = ShipmentInput;

export interface Shipment {
  id: number;
  customer_name: string | null;
  carrier_name: string | null;
  freight_mode: string;
  origin_port: string | null;
  destination_port: string | null;
  cargo_description: string | null;
  container_no: string | null;
  weight_kg: number | null;
  freight_cost: number | null;
  currency: string;
  status: string;
  shipment_date: string;
  eta: string | null;
  document_file_url: string | null;
  created_at: string;
}

export function uploadDocument(file: File, workspaceId: number) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("workspace_id", String(workspaceId));
  return requestForm<Document>("/documents/upload", formData);
}

export function confirmDocument(documentId: number, payload: ConfirmDocumentPayload, workspaceId: number) {
  return request<Shipment>(`/documents/${documentId}/confirm?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createShipment(payload: ShipmentInput, workspaceId: number) {
  return request<Shipment>(`/shipments?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ShipmentListResult {
  items: Shipment[];
  total: number;
}

export type ShipmentSortBy = "shipment_date" | "customer" | "cost" | "status";
export type SortDir = "asc" | "desc";

export interface ShipmentListParams {
  q?: string;
  status?: string[];
  sortBy?: ShipmentSortBy;
  sortDir?: SortDir;
}

export function fetchShipments(
  workspaceId: number,
  limit: number,
  offset: number,
  params: ShipmentListParams = {}
) {
  const search = new URLSearchParams({
    workspace_id: String(workspaceId),
    limit: String(limit),
    offset: String(offset),
  });
  if (params.q) search.set("q", params.q);
  if (params.sortBy) search.set("sort_by", params.sortBy);
  if (params.sortDir) search.set("sort_dir", params.sortDir);
  for (const s of params.status ?? []) search.append("status", s);

  return request<ShipmentListResult>(`/shipments?${search.toString()}`);
}

export function generateMockData(workspaceId: number, count: number) {
  return request<{ created: number }>(`/shipments/mock-data?workspace_id=${workspaceId}&count=${count}`, {
    method: "POST",
  });
}

export interface Quote {
  id: number;
  carrier_name: string;
  amount: number;
  currency: string;
  valid_until: string | null;
  status: string;
  created_at: string;
}

export interface TrackingEvent {
  id: number;
  status: string;
  location: string | null;
  event_date: string;
  note: string | null;
}

export interface ShipmentDetail extends Shipment {
  quotes: Quote[];
  tracking_events: TrackingEvent[];
}

export function fetchShipment(shipmentId: number, workspaceId: number) {
  return request<ShipmentDetail>(`/shipments/${shipmentId}?workspace_id=${workspaceId}`);
}

export function updateShipmentStatus(shipmentId: number, status: string, workspaceId: number) {
  return request<Shipment>(`/shipments/${shipmentId}/status?workspace_id=${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteShipment(shipmentId: number, workspaceId: number) {
  return request<void>(`/shipments/${shipmentId}?workspace_id=${workspaceId}`, { method: "DELETE" });
}

export function bulkUpdateShipmentStatus(ids: number[], status: string, workspaceId: number) {
  return request<{ updated: number }>(`/shipments/bulk-status?workspace_id=${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify({ ids, status }),
  });
}

export function bulkUpdateShipmentDates(
  ids: number[],
  dates: { shipment_date?: string; eta?: string },
  workspaceId: number
) {
  return request<{ updated: number }>(`/shipments/bulk-dates?workspace_id=${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify({ ids, ...dates }),
  });
}

export function bulkDeleteShipments(ids: number[], workspaceId: number) {
  return request<{ deleted: number }>(`/shipments/bulk-delete?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export function addTrackingEvent(
  shipmentId: number,
  payload: { status: string; location?: string | null; event_date: string; note?: string | null },
  workspaceId: number
) {
  return request<TrackingEvent>(`/shipments/${shipmentId}/tracking-events?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addQuote(
  shipmentId: number,
  payload: { carrier_id: number; amount: number; currency: string; valid_until?: string | null },
  workspaceId: number
) {
  return request<Quote>(`/shipments/${shipmentId}/quotes?workspace_id=${workspaceId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface MoneyAmount {
  currency: string;
  amount: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  amounts: MoneyAmount[];
}

export interface MonthlyShipmentCount {
  month: string;
  count: number;
  amounts: MoneyAmount[];
}

export interface TopCustomer {
  customer_name: string;
  shipment_count: number;
  amounts: MoneyAmount[];
}

export interface DashboardSummary {
  month: string;
  total_shipments: number;
  total_amounts: MoneyAmount[];
  status_breakdown: StatusBreakdown[];
  monthly_trend: MonthlyShipmentCount[];
  top_customers: TopCustomer[];
}

export function fetchDashboardSummary(workspaceId: number, month: string) {
  return request<DashboardSummary>(`/dashboard/summary?workspace_id=${workspaceId}&month=${month}`);
}

export interface ExchangeRate {
  base: string;
  target: string;
  rate: number;
  fetched_at: string;
}

export function fetchExchangeRate(base: string, target: string) {
  return request<ExchangeRate>(`/market-data/exchange-rate?base=${base}&target=${target}`);
}

export interface BankRate {
  country: string;
  bank_name: string;
  product_type: "demand" | "term";
  term_months: number | null;
  rate: number;
  source_url: string | null;
}

export function fetchBankRates(country: string) {
  return request<BankRate[]>(`/market-data/bank-rates?country=${country}`);
}

export interface MacroIndicator {
  country: string;
  indicator: string;
  value: number;
  year: number | null;
  source: string;
  fetched_at: string;
}

export function fetchMacroIndicator(country: string, indicator: string) {
  return request<MacroIndicator>(`/market-data/macro?country=${country}&indicator=${indicator}`);
}
