"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import {
  ApiError,
  fetchDashboardSummary,
  type DashboardSummary,
  type MoneyAmount,
  type StatusBreakdown,
} from "@/lib/api";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import SegmentedControl from "@/components/ui/SegmentedControl";

type Metric = "count" | "value";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

function monthLabelLong(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "12,345.00 USD" for a single currency, "12,345.00 USD · 800.00 EUR" when a
// section mixes currencies — never blended into one (meaningless) number.
function formatAmounts(amounts: MoneyAmount[]): string {
  if (amounts.length === 0) return "0.00";
  return amounts.map((a) => `${formatMoney(a.amount)} ${a.currency}`).join(" · ");
}

// The currency to scale bar charts against. Returns null when a section's
// rows are empty of amounts (bars render at 0, same as "no data") or span
// more than one currency (a USD bar and a EUR bar aren't comparable widths,
// so those sections fall back to a plain list instead — see `mixed` below).
function singleCurrency(rows: { amounts: MoneyAmount[] }[]): { currency: string | null; mixed: boolean } {
  const currencies = new Set<string>();
  for (const row of rows) for (const a of row.amounts) currencies.add(a.currency);
  if (currencies.size <= 1) return { currency: [...currencies][0] ?? null, mixed: false };
  return { currency: null, mixed: true };
}

function amountFor(amounts: MoneyAmount[], currency: string | null): number {
  if (currency === null) return 0;
  return amounts.find((a) => a.currency === currency)?.amount ?? 0;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [month, setMonth] = useState(currentMonth());
  const [metric, setMetric] = useState<Metric>("count");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Drilled-into month from clicking a trend bar — null means "By status"
  // shows the top-level (currently selected) month, same as before.
  const [selectedTrendMonth, setSelectedTrendMonth] = useState<string | null>(null);

  async function load() {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardSummary(currentWorkspace.id, month);
      setSummary(data);
      setSelectedTrendMonth(null);
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

  function handleBarClick(clickedMonth: string) {
    setSelectedTrendMonth((prev) => (prev === clickedMonth ? null : clickedMonth));
  }

  const activeStatusBreakdown: StatusBreakdown[] = useMemo(() => {
    if (!summary) return [];
    if (!selectedTrendMonth) return summary.status_breakdown;
    return (
      summary.monthly_status_breakdown.find((m) => m.month === selectedTrendMonth)?.status_breakdown ??
      []
    );
  }, [summary, selectedTrendMonth]);

  const trend = useMemo(() => singleCurrency(summary?.monthly_trend ?? []), [summary]);
  const statusCurrency = useMemo(() => singleCurrency(activeStatusBreakdown), [activeStatusBreakdown]);

  const maxTrendValue = useMemo(() => {
    if (!summary) return 1;
    const values =
      metric === "count"
        ? summary.monthly_trend.map((t) => t.count)
        : summary.monthly_trend.map((t) => amountFor(t.amounts, trend.currency));
    return Math.max(1, ...values);
  }, [summary, metric, trend.currency]);

  const maxStatusValue = useMemo(() => {
    const values =
      metric === "count"
        ? activeStatusBreakdown.map((s) => s.count)
        : activeStatusBreakdown.map((s) => amountFor(s.amounts, statusCurrency.currency));
    return Math.max(1, ...values);
  }, [activeStatusBreakdown, metric, statusCurrency.currency]);

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
          <ButtonLink href="/login" variant="primary">
            Log in
          </ButtonLink>
          <ButtonLink href="/register" variant="secondary">
            Register
          </ButtonLink>
        </div>
      </main>
    );
  }

  return (
    // Clicking anywhere in the page that doesn't stop propagation (i.e.
    // everywhere except the trend bars themselves) clears the drill-down —
    // the "click blank space to reset" gesture.
    <main onClick={() => setSelectedTrendMonth(null)} className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <SegmentedControl
            value={metric}
            onChange={setMetric}
            aria-label="Metric"
            options={[
              { value: "count", label: "Count" },
              { value: "value", label: "Value" },
            ]}
          />
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {summary && !loading && (
        <>
          <Card>
            <CardHeader className="items-start">
              <div>
                <p className="text-sm text-gray-500">
                  {metric === "count" ? "Total shipments this month" : "Total freight value this month"}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {metric === "count" ? summary.total_shipments : formatAmounts(summary.total_amounts)}
                </p>
                <p className="mt-1 text-xs text-gray-400">Cancelled shipments are excluded.</p>
              </div>
            </CardHeader>

            <p className="mb-3 text-sm font-medium text-gray-700">
              Monthly {metric === "count" ? "shipment volume" : "freight value"}
            </p>
            {metric === "value" && trend.mixed ? (
              <div className="space-y-1">
                {summary.monthly_trend.map((t) => (
                  <div key={t.month} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{monthLabel(t.month)}</span>
                    <span>{formatAmounts(t.amounts)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="relative flex h-36 items-end gap-3 border-b border-gray-200">
                  {summary.monthly_trend.map((t) => {
                    const value = metric === "count" ? t.count : amountFor(t.amounts, trend.currency);
                    const tooltip =
                      metric === "count" ? `${t.count} shipment${t.count === 1 ? "" : "s"}` : formatAmounts(t.amounts);
                    const isSelected = selectedTrendMonth === t.month;
                    return (
                      <div key={t.month} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBarClick(t.month);
                          }}
                          className={`w-6 max-w-full cursor-pointer rounded-t-[4px] transition-colors ${
                            isSelected
                              ? "bg-blue-600"
                              : selectedTrendMonth
                                ? "bg-gray-300 hover:bg-gray-400"
                                : "bg-gray-900 hover:bg-gray-700"
                          }`}
                          style={{ height: `${Math.max((value / maxTrendValue) * 100, value > 0 ? 3 : 0)}%` }}
                        />
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                          <span className="font-semibold tabular-nums">{tooltip}</span>
                          <span className="ml-1 text-gray-300">· {monthLabelLong(t.month)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-3">
                  {summary.monthly_trend.map((t) => (
                    <span
                      key={t.month}
                      className={`flex-1 text-center text-xs tabular-nums ${
                        selectedTrendMonth === t.month ? "font-medium text-blue-600" : "text-gray-500"
                      }`}
                    >
                      {monthLabel(t.month)}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-400">Click a month to see its status breakdown below.</p>
              </>
            )}
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By status</CardTitle>
                {selectedTrendMonth && (
                  <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {monthLabelLong(selectedTrendMonth)}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTrendMonth(null);
                      }}
                      aria-label="Clear month selection"
                      className="hover:text-blue-900"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </CardHeader>
              {activeStatusBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No shipments that month.</p>
              ) : metric === "value" && statusCurrency.mixed ? (
                <div className="space-y-1">
                  {activeStatusBreakdown.map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 capitalize">{statusLabel(s.status)}</span>
                      <span className="text-gray-500">{formatAmounts(s.amounts)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeStatusBreakdown.map((s) => {
                    const value = metric === "count" ? s.count : amountFor(s.amounts, statusCurrency.currency);
                    return (
                      <div key={s.status} className="flex items-center gap-3 text-sm">
                        <span className="w-20 shrink-0 text-gray-600 capitalize">{statusLabel(s.status)}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-gray-900"
                            style={{ width: `${Math.max((value / maxStatusValue) * 100, value > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right tabular-nums text-gray-500">
                          {metric === "count" ? s.count : formatMoney(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top customers</CardTitle>
              </CardHeader>
              {summary.top_customers.length === 0 ? (
                <p className="text-sm text-gray-500">No shipments this month.</p>
              ) : (
                <ul className="-mx-5 -mb-5 divide-y divide-gray-100">
                  {summary.top_customers.map((c) => (
                    <li key={c.customer_name} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium text-gray-600">
                          {c.customer_name.slice(0, 1).toUpperCase()}
                        </span>
                        {c.customer_name}
                      </span>
                      <span className="tabular-nums text-gray-500">
                        {metric === "count" ? `${c.shipment_count} shipments` : formatAmounts(c.amounts)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
