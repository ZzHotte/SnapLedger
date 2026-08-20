import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";
import type { DashboardSummary, User, Workspace } from "@/lib/api";

const { useAuthMock, useWorkspaceMock, fetchDashboardSummaryMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useWorkspaceMock: vi.fn(),
  fetchDashboardSummaryMock: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/workspace-context", () => ({ useWorkspace: useWorkspaceMock }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, fetchDashboardSummary: fetchDashboardSummaryMock };
});

const FAKE_USER: User = {
  id: 1,
  email: "test@example.com",
  name: null,
  avatar_url: null,
  base_currency: "USD",
};
const WORKSPACE: Workspace = { id: 1, name: "My Freight Team", role: "owner" };

const SINGLE_CURRENCY_SUMMARY: DashboardSummary = {
  month: "2026-08",
  total_shipments: 10,
  total_amounts: [{ currency: "USD", amount: 5000 }],
  status_breakdown: [
    { status: "booked", count: 6, amounts: [{ currency: "USD", amount: 3000 }] },
    { status: "cancelled", count: 2, amounts: [{ currency: "USD", amount: 999 }] },
    { status: "delivered", count: 4, amounts: [{ currency: "USD", amount: 2000 }] },
  ],
  monthly_trend: [
    { month: "2026-07", count: 5, amounts: [{ currency: "USD", amount: 2500 }] },
    { month: "2026-08", count: 10, amounts: [{ currency: "USD", amount: 5000 }] },
  ],
  top_customers: [{ customer_name: "Acme Import Co.", shipment_count: 10, amounts: [{ currency: "USD", amount: 5000 }] }],
};

const MIXED_CURRENCY_SUMMARY: DashboardSummary = {
  ...SINGLE_CURRENCY_SUMMARY,
  total_amounts: [
    { currency: "USD", amount: 5000 },
    { currency: "EUR", amount: 800 },
  ],
  status_breakdown: [
    {
      status: "booked",
      count: 6,
      amounts: [
        { currency: "USD", amount: 3000 },
        { currency: "EUR", amount: 800 },
      ],
    },
    { status: "delivered", count: 4, amounts: [{ currency: "USD", amount: 2000 }] },
  ],
  monthly_trend: [
    { month: "2026-07", count: 5, amounts: [{ currency: "USD", amount: 2500 }] },
    {
      month: "2026-08",
      count: 10,
      amounts: [
        { currency: "USD", amount: 2500 },
        { currency: "EUR", amount: 800 },
      ],
    },
  ],
};

beforeEach(() => {
  useAuthMock.mockReset();
  useWorkspaceMock.mockReset();
  fetchDashboardSummaryMock.mockReset();
  useAuthMock.mockReturnValue({ user: FAKE_USER, loading: false });
  useWorkspaceMock.mockReturnValue({ currentWorkspace: WORKSPACE });
});

describe("DashboardPage", () => {
  it("shows a login prompt when there's no user", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    // Mirrors real behavior: WorkspaceProvider clears currentWorkspace once
    // there's no logged-in user, which is what actually stops the fetch effect.
    useWorkspaceMock.mockReturnValue({ currentWorkspace: null });
    render(<DashboardPage />);
    expect(screen.getByText("SnapLedger Freight CRM")).toBeInTheDocument();
    expect(fetchDashboardSummaryMock).not.toHaveBeenCalled();
  });

  it("defaults to the Count tab and shows shipment counts", async () => {
    fetchDashboardSummaryMock.mockResolvedValue(SINGLE_CURRENCY_SUMMARY);
    render(<DashboardPage />);

    expect(await screen.findByText("Total shipments this month")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Cancelled shipments are excluded.")).toBeInTheDocument();
  });

  it("switches to the Value tab and shows formatted money instead of counts", async () => {
    fetchDashboardSummaryMock.mockResolvedValue(SINGLE_CURRENCY_SUMMARY);
    render(<DashboardPage />);
    await screen.findByText("Total shipments this month");

    fireEvent.click(screen.getByText("Value"));

    expect(await screen.findByText("Total freight value this month")).toBeInTheDocument();
    // "5,000.00 USD" legitimately appears twice here — the total card and the
    // (only) top customer happen to sum to the same figure in this fixture.
    expect(screen.getAllByText("5,000.00 USD").length).toBeGreaterThan(0);
  });

  it("falls back to a plain per-currency list instead of bars when a section mixes currencies", async () => {
    fetchDashboardSummaryMock.mockResolvedValue(MIXED_CURRENCY_SUMMARY);
    render(<DashboardPage />);
    await screen.findByText("Total shipments this month");

    fireEvent.click(screen.getByText("Value"));

    // total_amounts always renders as a formatted multi-currency string,
    // regardless of whether individual sections fall back to a list
    expect(await screen.findByText("5,000.00 USD · 800.00 EUR")).toBeInTheDocument();
    // the mixed-currency "booked" row falls back to the same combined string
    expect(screen.getByText("3,000.00 USD · 800.00 EUR")).toBeInTheDocument();
  });

  it("re-fetches when the month changes", async () => {
    fetchDashboardSummaryMock.mockResolvedValue(SINGLE_CURRENCY_SUMMARY);
    render(<DashboardPage />);
    await waitFor(() => expect(fetchDashboardSummaryMock).toHaveBeenCalledTimes(1));
    const [, initialMonth] = fetchDashboardSummaryMock.mock.calls[0];

    fireEvent.change(screen.getByDisplayValue(initialMonth), { target: { value: "2025-01" } });

    await waitFor(() => expect(fetchDashboardSummaryMock).toHaveBeenCalledWith(1, "2025-01"));
  });
});
