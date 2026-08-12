import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInviteClient from "./accept-invite-client";
import type { User } from "@/lib/api";

const { useAuthMock, useLedgerMock, acceptInviteMock, pushMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useLedgerMock: vi.fn(),
  acceptInviteMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/ledger-context", () => ({ useLedger: useLedgerMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, acceptInvite: acceptInviteMock };
});

const FAKE_USER: User = {
  id: 1,
  email: "joiner@example.com",
  name: null,
  avatar_url: null,
  base_currency: "USD",
};

const refreshMock = vi.fn().mockResolvedValue(undefined);
const selectLedgerMock = vi.fn();

beforeEach(() => {
  useAuthMock.mockReset();
  useLedgerMock.mockReset();
  acceptInviteMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockClear();
  selectLedgerMock.mockClear();
  useLedgerMock.mockReturnValue({ refresh: refreshMock, selectLedger: selectLedgerMock });
});

describe("AcceptInviteClient", () => {
  it("prompts to log in when there's no user", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(<AcceptInviteClient code="abc123" />);

    expect(screen.getByText(/log in or register/i)).toBeInTheDocument();
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });

  it("accepts the invite and shows the joined ledger name", async () => {
    useAuthMock.mockReturnValue({ user: FAKE_USER, loading: false });
    acceptInviteMock.mockResolvedValue({ ledger_id: 7, ledger_name: "Roommates", role: "editor" });

    render(<AcceptInviteClient code="abc123" />);
    fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));

    await waitFor(() => expect(screen.getByText(/you joined Roommates/i)).toBeInTheDocument());
    expect(acceptInviteMock).toHaveBeenCalledWith("abc123");
    expect(refreshMock).toHaveBeenCalled();
    expect(selectLedgerMock).toHaveBeenCalledWith(7);
  });

  it("shows an error and stays on the accept screen when the invite is invalid", async () => {
    const { ApiError } = await import("@/lib/api");
    useAuthMock.mockReturnValue({ user: FAKE_USER, loading: false });
    acceptInviteMock.mockRejectedValue(new ApiError(409, "Invite already used"));

    render(<AcceptInviteClient code="abc123" />);
    fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));

    await waitFor(() => expect(screen.getByText("Invite already used")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /accept invite/i })).toBeInTheDocument();
  });
});
