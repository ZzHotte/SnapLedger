"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fetchSession, loginUser, registerUser, type User, type Workspace } from "./api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  setToken: (token: string) => Promise<void>;
  // Workspaces fetched alongside the user in the same request (session restore,
  // login, register, OAuth callback all return both in one round trip) — lets
  // WorkspaceProvider skip its own /workspaces call the first time. Consumed
  // (cleared) once WorkspaceProvider reads it, so later refreshes hit the API.
  bootstrapWorkspaces: Workspace[] | null;
  clearBootstrapWorkspaces: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapWorkspaces, setBootstrapWorkspaces] = useState<Workspace[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const token = localStorage.getItem("token");
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const session = await fetchSession();
        if (!cancelled) {
          setUser(session.user);
          setBootstrapWorkspaces(session.workspaces);
        }
      } catch {
        localStorage.removeItem("token");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(email: string, password: string) {
    const res = await loginUser(email, password);
    localStorage.setItem("token", res.access_token);
    setUser(res.user);
    setBootstrapWorkspaces(res.workspaces);
    router.push("/");
  }

  async function register(email: string, password: string, name: string) {
    const res = await registerUser(email, password, name);
    localStorage.setItem("token", res.access_token);
    setUser(res.user);
    setBootstrapWorkspaces(res.workspaces);
    router.push("/");
  }

  async function setToken(token: string) {
    localStorage.setItem("token", token);
    const session = await fetchSession();
    setUser(session.user);
    setBootstrapWorkspaces(session.workspaces);
    router.push("/");
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setBootstrapWorkspaces(null);
    router.push("/login");
  }

  function clearBootstrapWorkspaces() {
    setBootstrapWorkspaces(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, setToken, bootstrapWorkspaces, clearBootstrapWorkspaces }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
