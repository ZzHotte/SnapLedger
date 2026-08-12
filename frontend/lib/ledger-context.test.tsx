import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerProvider, useLedger } from "./ledger-context";
import type { User } from "./api";

const { useAuthMock, fetchLedgersMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fetchLedgersMock: vi.fn(),
}));

vi.mock("./auth-context", () => ({
  useAuth: useAuthMock,
}));

vi.mock("./api", () => ({
  fetchLedgers: fetchLedgersMock,
}));

const FAKE_USER: User = {
  id: 1,
  email: "test@example.com",
  name: null,
  avatar_url: null,
  base_currency: "USD",
};

function TestConsumer() {
  const { ledgers, currentLedger, selectLedger } = useLedger();
  return (
    <div>
      <span data-testid="current-id">{currentLedger?.id ?? "none"}</span>
      <span data-testid="ledger-count">{ledgers.length}</span>
      <button onClick={() => selectLedger(2)}>select-2</button>
    </div>
  );
}

function renderWithUser(user: User | null) {
  useAuthMock.mockReturnValue({ user });
  return render(
    <LedgerProvider>
      <TestConsumer />
    </LedgerProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchLedgersMock.mockReset();
  useAuthMock.mockReset();
});

describe("LedgerProvider", () => {
  it("defaults to the owner-role ledger when nothing is stored", async () => {
    fetchLedgersMock.mockResolvedValue([
      { id: 1, name: "Personal", role: "owner" },
      { id: 2, name: "Roommates", role: "viewer" },
    ]);

    renderWithUser(FAKE_USER);

    expect(await screen.findByTestId("current-id")).toHaveTextContent("1");
    expect(screen.getByTestId("ledger-count")).toHaveTextContent("2");
  });

  it("restores the previously selected ledger from localStorage", async () => {
    localStorage.setItem("ledgerId", "2");
    fetchLedgersMock.mockResolvedValue([
      { id: 1, name: "Personal", role: "owner" },
      { id: 2, name: "Roommates", role: "viewer" },
    ]);

    renderWithUser(FAKE_USER);

    expect(await screen.findByTestId("current-id")).toHaveTextContent("2");
  });

  it("falls back to the first ledger when the stored id no longer exists", async () => {
    localStorage.setItem("ledgerId", "999");
    fetchLedgersMock.mockResolvedValue([{ id: 5, name: "Shared", role: "editor" }]);

    renderWithUser(FAKE_USER);

    expect(await screen.findByTestId("current-id")).toHaveTextContent("5");
  });

  it("persists the choice to localStorage when the user switches ledgers", async () => {
    fetchLedgersMock.mockResolvedValue([
      { id: 1, name: "Personal", role: "owner" },
      { id: 2, name: "Roommates", role: "viewer" },
    ]);
    renderWithUser(FAKE_USER);
    await screen.findByTestId("current-id");

    fireEvent.click(screen.getByText("select-2"));

    expect(await screen.findByTestId("current-id")).toHaveTextContent("2");
    expect(localStorage.getItem("ledgerId")).toBe("2");
  });

  it("clears ledgers and skips fetching when there is no logged-in user", async () => {
    fetchLedgersMock.mockResolvedValue([]);

    renderWithUser(null);

    expect(await screen.findByTestId("ledger-count")).toHaveTextContent("0");
    expect(screen.getByTestId("current-id")).toHaveTextContent("none");
    expect(fetchLedgersMock).not.toHaveBeenCalled();
  });
});
