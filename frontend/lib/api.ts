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

export interface Ledger {
  id: number;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export function fetchLedgers() {
  return request<Ledger[]>("/ledgers");
}

export interface LedgerMember {
  user_id: number;
  email: string;
  name: string | null;
  role: "owner" | "editor" | "viewer";
  joined_at: string | null;
}

export function fetchLedgerMembers(ledgerId: number) {
  return request<LedgerMember[]>(`/ledgers/${ledgerId}/members`);
}

export function updateMemberRole(ledgerId: number, userId: number, role: "editor" | "viewer") {
  return request<LedgerMember>(`/ledgers/${ledgerId}/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeMember(ledgerId: number, userId: number) {
  return request<void>(`/ledgers/${ledgerId}/members/${userId}`, { method: "DELETE" });
}

export interface Invite {
  id: number;
  invite_code: string;
  role: "editor" | "viewer";
  expires_at: string | null;
}

export function createInvite(ledgerId: number, role: "editor" | "viewer") {
  return request<Invite>(`/ledgers/${ledgerId}/invites`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export interface AcceptInviteResult {
  ledger_id: number;
  ledger_name: string;
  role: "owner" | "editor" | "viewer";
}

export function acceptInvite(code: string) {
  return request<AcceptInviteResult>(`/ledgers/invites/${code}/accept`, { method: "POST" });
}

export const CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Other"] as const;

export interface Receipt {
  id: number;
  image_url: string;
  status: string;
  merchant: string | null;
  transaction_date: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
}

export interface ConfirmReceiptPayload {
  merchant: string | null;
  transaction_date: string;
  amount: number;
  currency: string;
  category: string;
  note?: string;
}

export interface Transaction {
  id: number;
  amount: number;
  currency: string;
  merchant: string | null;
  transaction_date: string;
  category: string | null;
  receipt_image_url: string | null;
  created_at: string;
}

export function uploadReceipt(file: File, ledgerId: number) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("ledger_id", String(ledgerId));
  return requestForm<Receipt>("/receipts/upload", formData);
}

export function confirmReceipt(receiptId: number, payload: ConfirmReceiptPayload, ledgerId: number) {
  return request<Transaction>(`/receipts/${receiptId}/confirm?ledger_id=${ledgerId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTransactions(ledgerId: number) {
  return request<Transaction[]>(`/transactions?ledger_id=${ledgerId}`);
}
