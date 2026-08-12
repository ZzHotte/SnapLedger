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

export function uploadReceipt(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return requestForm<Receipt>("/receipts/upload", formData);
}

export function confirmReceipt(receiptId: number, payload: ConfirmReceiptPayload) {
  return request<Transaction>(`/receipts/${receiptId}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTransactions() {
  return request<Transaction[]>("/transactions");
}
