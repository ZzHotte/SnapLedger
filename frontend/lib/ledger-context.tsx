"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { fetchLedgers, type Ledger } from "./api";

const STORAGE_KEY = "ledgerId";

interface LedgerContextValue {
  ledgers: Ledger[];
  currentLedger: Ledger | null;
  loading: boolean;
  selectLedger: (id: number) => void;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [currentLedgerId, setCurrentLedgerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) {
        setLedgers([]);
        setCurrentLedgerId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchLedgers();
        if (cancelled) return;
        setLedgers(data);
        const storedId = Number(localStorage.getItem(STORAGE_KEY));
        const fallback = data.find((l) => l.role === "owner") ?? data[0] ?? null;
        const selected = data.find((l) => l.id === storedId) ?? fallback;
        setCurrentLedgerId(selected ? selected.id : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function selectLedger(id: number) {
    setCurrentLedgerId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  const currentLedger = ledgers.find((l) => l.id === currentLedgerId) ?? null;

  return (
    <LedgerContext.Provider value={{ ledgers, currentLedger, loading, selectLedger }}>
      {children}
    </LedgerContext.Provider>
  );
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within LedgerProvider");
  return ctx;
}
