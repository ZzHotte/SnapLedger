"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { fetchWorkspaces, type Workspace } from "./api";

const STORAGE_KEY = "workspaceId";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  selectWorkspace: (id: number) => void;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchWorkspaces();
      setWorkspaces(data);
      setCurrentWorkspaceId((prevId) => {
        // keep the current selection if it's still valid (e.g. after inviting
        // someone else, or after a role change that doesn't remove the workspace)
        if (data.some((w) => w.id === prevId)) return prevId;
        const storedId = Number(localStorage.getItem(STORAGE_KEY));
        const fallback = data.find((w) => w.role === "owner") ?? data[0] ?? null;
        const selected = data.find((w) => w.id === storedId) ?? fallback;
        return selected ? selected.id : null;
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // refresh is a stable useCallback exposed for manual re-syncs elsewhere (e.g.
    // after accepting an invite) too, so it's defined outside this effect —
    // react-hooks/set-state-in-effect can't see that and flags the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // only re-run when the user changes, not every time refresh() is recreated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function selectWorkspace(id: number) {
    setCurrentWorkspaceId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) ?? null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, currentWorkspace, loading, selectWorkspace, refresh }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
