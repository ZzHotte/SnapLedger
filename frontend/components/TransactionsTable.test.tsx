import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TransactionsTable from "./TransactionsTable";
import type { Ledger, Transaction, TransactionListResult } from "@/lib/api";

const { useLedgerMock, fetchTransactionsMock } = vi.hoisted(() => ({
  useLedgerMock: vi.fn(),
  fetchTransactionsMock: vi.fn(),
}));

vi.mock("@/lib/ledger-context", () => ({ useLedger: useLedgerMock }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, fetchTransactions: fetchTransactionsMock };
});

const LEDGER: Ledger = { id: 1, name: "Personal", role: "owner" };

function makeTransaction(id: number): Transaction {
  return {
    id,
    amount: 10,
    currency: "USD",
    merchant: `Merchant ${id}`,
    transaction_date: "2026-08-01",
    category: "Food",
    receipt_image_url: null,
    created_at: "2026-08-01T00:00:00Z",
  };
}

function pageOf(total: number, offset: number, limit: number): TransactionListResult {
  const items = Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) =>
    makeTransaction(offset + i + 1)
  );
  return { items, total };
}

beforeEach(() => {
  useLedgerMock.mockReset();
  fetchTransactionsMock.mockReset();
  useLedgerMock.mockReturnValue({ currentLedger: LEDGER });
  fetchTransactionsMock.mockImplementation(async (_ledgerId: number, limit: number, offset: number) =>
    pageOf(120, offset, limit)
  );
});

describe("TransactionsTable", () => {
  it("fetches page 0 on mount", async () => {
    render(<TransactionsTable refreshKey={0} />);

    await waitFor(() => expect(screen.getByText("120 transactions")).toBeInTheDocument());
    expect(fetchTransactionsMock).toHaveBeenCalledWith(1, 50, 0);
  });

  it("does not re-fetch the stale offset when refreshKey changes while on page > 0", async () => {
    const { rerender } = render(<TransactionsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(fetchTransactionsMock).toHaveBeenCalledWith(1, 50, 50);

    fetchTransactionsMock.mockClear();

    // Simulate a new transaction being added (bumps refreshKey) while on page 2 —
    // this is exactly the scenario that used to fire one wasted fetch at the
    // stale offset (100) before resetting to page 0.
    rerender(<TransactionsTable refreshKey={1} />);

    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());
    expect(fetchTransactionsMock).toHaveBeenCalledTimes(1);
    expect(fetchTransactionsMock).toHaveBeenCalledWith(1, 50, 0);
  });
});
