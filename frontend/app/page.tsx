"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ApiError, fetchDashboardSummary, type DashboardSummary } from "@/lib/api";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary(currentWorkspace.id, month);
      setSummary(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, month]);

  const maxStatusCount = useMemo(
    () => Math.max(1, ...(summary?.status_breakdown.map((s) => s.count) ?? [0])),
    [summary]
  );
  const maxTrendCount = useMemo(
    () => Math.max(1, ...(summary?.monthly_trend.map((t) => t.count) ?? [0])),
    [summary]
  );

  if (authLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">SnapLedger Freight CRM</h1>
        <div className="flex gap-3">
          <Link href="/login" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
            Log in
          </Link>
          <Link href="/register" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium">
            Register
          </Link>
        </div>
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
            <h2 className="mb-1 text-sm font-medium text-gray-700">Total shipments this month</h2>
            <p className="text-2xl font-semibold">{summary.total_shipments}</p>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-700">Monthly shipment volume</h2>
            <div className="flex h-32 items-end gap-3">
              {summary.monthly_trend.map((t) => (
                <div key={t.month} className="flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-black"
                    style={{ height: `${(t.count / maxTrendCount) * 100}%` }}
                    title={`${t.month}: ${t.count}`}
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
            <h2 className="mb-3 text-sm font-medium text-gray-700">By status</h2>
            {summary.status_breakdown.length === 0 ? (
              <p className="text-sm text-gray-500">No shipments this month.</p>
            ) : (
              <div className="space-y-2">
                {summary.status_breakdown.map((s) => (
                  <div key={s.status} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-gray-600 capitalize">{statusLabel(s.status)}</span>
                    <div className="h-2 flex-1 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-black"
                        style={{ width: `${(s.count / maxStatusCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-gray-500">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-gray-700">Top customers</h2>
            {summary.top_customers.length === 0 ? (
              <p className="text-sm text-gray-500">No shipments this month.</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                {summary.top_customers.map((c) => (
                  <li key={c.customer_name} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>{c.customer_name}</span>
                    <span className="text-gray-500">{c.shipment_count} shipments</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
