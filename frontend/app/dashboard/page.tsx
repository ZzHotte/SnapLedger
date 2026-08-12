"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLedger } from "@/lib/ledger-context";
import { ApiError, CATEGORIES, fetchDashboardSummary, upsertBudget, type DashboardSummary } from "@/lib/api";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentLedger } = useLedger();

  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [budgetCategory, setBudgetCategory] = useState<string>(CATEGORIES[0]);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  const canEdit = currentLedger?.role !== "viewer";

  async function load() {
    if (!currentLedger) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary(currentLedger.id, month);
      setSummary(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load reads currentLedger/month from the closure and is also called again
    // after saving a budget, so it's defined outside this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLedger, month]);

  async function handleSaveBudget() {
    if (!currentLedger || !budgetAmount) return;
    setSavingBudget(true);
    setError(null);
    try {
      await upsertBudget(currentLedger.id, budgetCategory, month, parseFloat(budgetAmount));
      setBudgetAmount("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save budget");
    } finally {
      setSavingBudget(false);
    }
  }

  const maxCategoryAmount = useMemo(
    () => Math.max(1, ...(summary?.category_breakdown.map((c) => c.amount) ?? [0])),
    [summary]
  );
  const maxTrendAmount = useMemo(
    () => Math.max(1, ...(summary?.monthly_trend.map((t) => t.amount) ?? [0])),
    [summary]
  );

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {summary && !loading && (
        <>
          <section>
            <h2 className="mb-1 text-sm font-medium text-gray-700">Total spent</h2>
            <p className="text-2xl font-semibold">{summary.total_spent.toFixed(2)}</p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-700">Monthly trend</h2>
            <div className="flex h-32 items-end gap-3">
              {summary.monthly_trend.map((t) => (
                <div key={t.month} className="flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-black"
                    style={{ height: `${(t.amount / maxTrendAmount) * 100}%` }}
                    title={`${t.month}: ${t.amount.toFixed(2)}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-3">
              {summary.monthly_trend.map((t) => (
                <span key={t.month} className="flex-1 text-center text-xs text-gray-500">
                  {monthLabel(t.month)}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-700">By category</h2>
            {summary.category_breakdown.length === 0 ? (
              <p className="text-sm text-gray-500">No spending this month.</p>
            ) : (
              <div className="space-y-2">
                {summary.category_breakdown.map((c) => (
                  <div key={c.category} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-gray-600">{c.category}</span>
                    <div className="h-2 flex-1 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-black"
                        style={{ width: `${(c.amount / maxCategoryAmount) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-gray-500">{c.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-700">Budget vs actual</h2>
            {summary.budgets.length === 0 ? (
              <p className="text-sm text-gray-500">No budgets set for this month yet.</p>
            ) : (
              <div className="space-y-3">
                {summary.budgets.map((b) => {
                  const pct = Math.min(100, (b.actual_amount / b.planned_amount) * 100);
                  const over = b.actual_amount > b.planned_amount;
                  return (
                    <div key={b.category} className="text-sm">
                      <div className="mb-1 flex justify-between text-gray-600">
                        <span>{b.category}</span>
                        <span className={over ? "font-medium text-red-600" : "text-gray-500"}>
                          {b.actual_amount.toFixed(2)} / {b.planned_amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100">
                        <div
                          className={`h-2 rounded-full ${over ? "bg-red-500" : "bg-black"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canEdit && (
              <div className="mt-4 flex items-center gap-2">
                <select
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Budget amount"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={handleSaveBudget}
                  disabled={savingBudget || !budgetAmount}
                  className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingBudget ? "Saving..." : "Set budget"}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
