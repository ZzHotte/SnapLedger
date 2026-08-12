"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { fetchLedgers, type Ledger } from "./api";

const STORAGE_KEY = "ledgerId";

interface LedgerContextValue {
  ledgers: Ledger[];
  currentLedger: Ledger | null;
  loading: boolean;
  selectLedger: (id: number) => void;
  refresh: () => Promise<void>;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [currentLedgerId, setCurrentLedgerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setLedgers([]);
      setCurrentLedgerId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchLedgers();
      setLedgers(data);
      setCurrentLedgerId((prevId) => {
        // keep the current selection if it's still valid (e.g. after inviting
        // someone else, or after a role change that doesn't remove the ledger)
        if (data.some((l) => l.id === prevId)) return prevId;
        const storedId = Number(localStorage.getItem(STORAGE_KEY));
        const fallback = data.find((l) => l.role === "owner") ?? data[0] ?? null;
        const selected = data.find((l) => l.id === storedId) ?? fallback;
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

  function selectLedger(id: number) {
    setCurrentLedgerId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  const currentLedger = ledgers.find((l) => l.id === currentLedgerId) ?? null;

  return (
    <LedgerContext.Provider value={{ ledgers, currentLedger, loading, selectLedger, refresh }}>
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within LedgerProvider");
  return ctx;
}
