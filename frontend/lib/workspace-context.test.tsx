import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import type { User } from "./api";

const { useAuthMock, fetchWorkspacesMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fetchWorkspacesMock: vi.fn(),
}));

vi.mock("./auth-context", () => ({
  useAuth: useAuthMock,
}));

vi.mock("./api", () => ({
  fetchWorkspaces: fetchWorkspacesMock,
}));

const FAKE_USER: User = {
  id: 1,
  email: "test@example.com",
  name: null,
  avatar_url: null,
  base_currency: "USD",
};

function TestConsumer() {
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();
  return (
    <div>
      <span data-testid="current-id">{currentWorkspace?.id ?? "none"}</span>
      <span data-testid="workspace-count">{workspaces.length}</span>
      <button onClick={() => selectWorkspace(2)}>select-2</button>
    </div>
  );
}

function renderWithUser(user: User | null) {
  useAuthMock.mockReturnValue({ user });
  return render(
    <WorkspaceProvider>
      <TestConsumer />
    </WorkspaceProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchWorkspacesMock.mockReset();
  useAuthMock.mockReset();
});

describe("WorkspaceProvider", () => {
  it("defaults to the owner-role workspace when nothing is stored", async () => {
    fetchWorkspacesMock.mockResolvedValue([
      { id: 1, name: "My Freight Team", role: "owner" },
      { id: 2, name: "Acme Freight", role: "viewer" },
    ]);

    renderWithUser(FAKE_USER);

    await waitFor(() => expect(screen.getByTestId("current-id")).toHaveTextContent("1"));
    expect(screen.getByTestId("workspace-count")).toHaveTextContent("2");
  });

  it("restores the previously selected workspace from localStorage", async () => {
    localStorage.setItem("workspaceId", "2");
    fetchWorkspacesMock.mockResolvedValue([
      { id: 1, name: "My Freight Team", role: "owner" },
      { id: 2, name: "Acme Freight", role: "viewer" },
    ]);

    renderWithUser(FAKE_USER);

    await waitFor(() => expect(screen.getByTestId("current-id")).toHaveTextContent("2"));
  });

  it("falls back to the first workspace when the stored id no longer exists", async () => {
    localStorage.setItem("workspaceId", "999");
    fetchWorkspacesMock.mockResolvedValue([{ id: 5, name: "Shared", role: "editor" }]);

    renderWithUser(FAKE_USER);

    await waitFor(() => expect(screen.getByTestId("current-id")).toHaveTextContent("5"));
  });

  it("persists the choice to localStorage when the user switches workspaces", async () => {
    fetchWorkspacesMock.mockResolvedValue([
      { id: 1, name: "My Freight Team", role: "owner" },
      { id: 2, name: "Acme Freight", role: "viewer" },
    ]);
    renderWithUser(FAKE_USER);
    await waitFor(() => expect(screen.getByTestId("workspace-count")).toHaveTextContent("2"));

    fireEvent.click(screen.getByText("select-2"));

    expect(screen.getByTestId("current-id")).toHaveTextContent("2");
    expect(localStorage.getItem("workspaceId")).toBe("2");
  });

  it("clears workspaces and skips fetching when there is no logged-in user", async () => {
    fetchWorkspacesMock.mockResolvedValue([]);

    renderWithUser(null);

    expect(await screen.findByTestId("workspace-count")).toHaveTextContent("0");
    expect(screen.getByTestId("current-id")).toHaveTextContent("none");
    expect(fetchWorkspacesMock).not.toHaveBeenCalled();
  });
});
