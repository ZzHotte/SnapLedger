import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInviteClient from "./accept-invite-client";
import type { User } from "@/lib/api";

const { useAuthMock, useWorkspaceMock, acceptInviteMock, pushMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useWorkspaceMock: vi.fn(),
  acceptInviteMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/workspace-context", () => ({ useWorkspace: useWorkspaceMock }));
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
const selectWorkspaceMock = vi.fn();

beforeEach(() => {
  useAuthMock.mockReset();
  useWorkspaceMock.mockReset();
  acceptInviteMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockClear();
  selectWorkspaceMock.mockClear();
  useWorkspaceMock.mockReturnValue({ refresh: refreshMock, selectWorkspace: selectWorkspaceMock });
});

describe("AcceptInviteClient", () => {
  it("prompts to log in when there's no user", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(<AcceptInviteClient code="abc123" />);

    expect(screen.getByText(/log in or register/i)).toBeInTheDocument();
    expect(acceptInviteMock).not.toHaveBeenCalled();
  });

  it("accepts the invite and shows the joined workspace name", async () => {
    useAuthMock.mockReturnValue({ user: FAKE_USER, loading: false });
    acceptInviteMock.mockResolvedValue({ workspace_id: 7, workspace_name: "Acme Freight", role: "editor" });

    render(<AcceptInviteClient code="abc123" />);
    fireEvent.click(screen.getByRole("button", { name: /accept invite/i }));

    await waitFor(() => expect(screen.getByText(/you joined Acme Freight/i)).toBeInTheDocument());
    expect(acceptInviteMock).toHaveBeenCalledWith("abc123");
    expect(refreshMock).toHaveBeenCalled();
    expect(selectWorkspaceMock).toHaveBeenCalledWith(7);
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
