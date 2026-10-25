"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  bulkDeleteShipments,
  bulkUpdateShipmentDates,
  bulkUpdateShipmentStatus,
  deleteShipment,
  fetchShipments,
  fetchShipmentStatusCounts,
  fetchShipmentsSummary,
  updateShipmentStatus,
  type Shipment,
  type ShipmentSortBy,
  type SortDir,
} from "@/lib/api";
import { formatAmounts } from "@/lib/format";
import { FREIGHT_MODES, SHIPMENT_STATUSES } from "@/lib/constants";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/Button";
import Popover from "@/components/ui/Popover";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

type ColumnKey = "date" | "customer" | "route" | "mode" | "status" | "cost";

const COLUMN_DEFS: { key: ColumnKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "route", label: "Route" },
  { key: "mode", label: "Mode" },
  { key: "status", label: "Status" },
  { key: "cost", label: "Freight cost" },
];

type Density = "compact" | "default" | "relaxed";

const ROW_PADDING: Record<Density, string> = {
  compact: "py-1",
  default: "py-2.5",
  relaxed: "py-4",
};

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private browsing / quota — these are just remembered view prefs, fine to drop
  }
}

function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h5M3 12h5M3 17h5M14 7h7M14 12h7M14 17h7" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

// First page, last page, current page ± 1, "…" where the window skips pages —
// standard windowed pagination so a 1,000-page table doesn't render 1,000 buttons.
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  const pages = new Set<number>([0, total - 1, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("ellipsis");
    out.push(sorted[i]);
  }
  return out;
}

const STATUS_STYLES: Record<string, string> = {
  inquiry: "bg-gray-100 text-gray-700",
  quoted: "bg-blue-100 text-blue-700",
  booked: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-amber-100 text-amber-800",
  arrived: "bg-teal-100 text-teal-700",
  customs: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

// A slightly deeper step of each STATUS_STYLES hue, for the small dot — a
// solid 100-step background is too light to read as a dot on its own.
const STATUS_DOT: Record<string, string> = {
  inquiry: "bg-gray-400",
  quoted: "bg-blue-500",
  booked: "bg-indigo-500",
  in_transit: "bg-amber-500",
  arrived: "bg-teal-500",
  customs: "bg-purple-500",
  delivered: "bg-green-500",
  cancelled: "bg-red-500",
};

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

function StatusDot({ status, className = "" }: { status: string; className?: string }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status] ?? "bg-gray-400"} ${className}`} />;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      <StatusDot status={status} />
      {statusLabel(status)}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium text-gray-600">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatusSelect({
  status,
  disabled,
  onChange,
  label,
}: {
  status: string;
  disabled: boolean;
  onChange: (next: string) => void;
  label: string;
}) {
  return (
    <select
      value={status}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize disabled:opacity-50 ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {SHIPMENT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </select>
  );
}

interface SortHeaderProps {
  label: string;
  column: ShipmentSortBy;
  sortBy: ShipmentSortBy;
  sortDir: SortDir;
  onSort: (column: ShipmentSortBy) => void;
  align?: "left" | "right";
}

function SortHeader({ label, column, sortBy, sortDir, onSort, align = "left" }: SortHeaderProps) {
  const active = sortBy === column;
  return (
    <th className={`py-2.5 pr-4 text-[11px] font-medium tracking-wide uppercase ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-gray-900 ${active ? "text-gray-900" : ""}`}
      >
        {label}
        <span className="text-gray-400">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

export default function ShipmentsTable({ refreshKey }: { refreshKey: number }) {
  const { currentWorkspace } = useWorkspace();
  const canEdit = currentWorkspace?.role !== "viewer";
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [summaryAmounts, setSummaryAmounts] = useState<{ currency: string; amount: number }[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(() => readLocalStorage("shipments.pageSize", DEFAULT_PAGE_SIZE));
  const [density, setDensity] = useState<Density>(() => readLocalStorage("shipments.density", "default" as Density));
  const [showSummaryRow, setShowSummaryRow] = useState(() => readLocalStorage("shipments.showSummaryRow", true));
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() =>
    readLocalStorage(
      "shipments.visibleColumns",
      COLUMN_DEFS.map((c) => c.key)
    )
  );
  const [loading, setLoading] = useState(true);
  const [everLoaded, setEverLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Bumped after a row-level status change or delete to force a refetch
  // without resetting the current page (unlike search/filter/sort changes,
  // which should jump back to page 0 — see resetKey below).
  const [localRefresh, setLocalRefresh] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>(SHIPMENT_STATUSES[0]);
  const [bulkShipmentDate, setBulkShipmentDate] = useState("");
  const [bulkEta, setBulkEta] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [freightModeFilter, setFreightModeFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<ShipmentSortBy>("shipment_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => writeLocalStorage("shipments.pageSize", pageSize), [pageSize]);
  useEffect(() => writeLocalStorage("shipments.density", density), [density]);
  useEffect(() => writeLocalStorage("shipments.showSummaryRow", showSummaryRow), [showSummaryRow]);
  useEffect(() => writeLocalStorage("shipments.visibleColumns", visibleColumns), [visibleColumns]);

  function toggleStatus(s: string) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function toggleFreightMode(m: string) {
    setFreightModeFilter((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // keep at least one column visible
        return prev.filter((k) => k !== key);
      }
      return COLUMN_DEFS.map((c) => c.key).filter((k) => prev.includes(k) || k === key);
    });
  }

  function handleSort(column: ShipmentSortBy) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }

  // Switching workspaces, search/filter/sort, or adding a shipment invalidates
  // whatever page we were on — jump back to the first page rather than showing
  // a now-meaningless offset. Adjusted during render (React's documented
  // pattern for this — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a separate effect: a second effect would still fire the fetch
  // effect below once with the stale `page` before the reset lands, wasting a
  // request on every change that happens while page > 0.
  const resetKey = `${currentWorkspace?.id ?? "none"}:${refreshKey}:${debouncedSearch}:${statusFilter.join(",")}:${freightModeFilter.join(",")}:${sortBy}:${sortDir}:${pageSize}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPage(0);
    setSelectedIds(new Set());
  }

  useEffect(() => {
    if (!currentWorkspace) return;
    const workspaceId = currentWorkspace.id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchShipments(workspaceId, pageSize, page * pageSize, {
          q: debouncedSearch || undefined,
          status: statusFilter.length > 0 ? statusFilter : undefined,
          freightMode: freightModeFilter.length > 0 ? freightModeFilter : undefined,
          sortBy,
          sortDir,
        });
        if (!cancelled) {
          setShipments(data.items);
          setTotal(data.total);
          setEverLoaded(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load shipments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, currentWorkspace, page, pageSize, debouncedSearch, statusFilter, freightModeFilter, sortBy, sortDir, localRefresh]);

  // Separate from the list fetch above — the filter chips' counts are a
  // workspace-wide overview, not scoped to the current search/filter/page, so
  // they only need to refetch when the underlying data actually changes, not
  // on every keystroke or page turn.
  useEffect(() => {
    if (!currentWorkspace) return;
    const workspaceId = currentWorkspace.id;
    let cancelled = false;

    fetchShipmentStatusCounts(workspaceId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const row of rows) next[row.status] = row.count;
        setStatusCounts(next);
      })
      .catch(() => {
        if (!cancelled) setStatusCounts({});
      });

    return () => {
      cancelled = true;
    };
  }, [currentWorkspace, refreshKey, localRefresh]);

  // The summary row's sum is a total over every row matching the current
  // search/status/freight-mode filters, not just the current page — so it
  // refetches on those, unlike the status chips' workspace-wide counts above.
  useEffect(() => {
    if (!currentWorkspace) return;
    const workspaceId = currentWorkspace.id;
    let cancelled = false;

    fetchShipmentsSummary(workspaceId, {
      q: debouncedSearch || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
      freightMode: freightModeFilter.length > 0 ? freightModeFilter : undefined,
    })
      .then((data) => {
        if (!cancelled) setSummaryAmounts(data.total_freight_cost);
      })
      .catch(() => {
        if (!cancelled) setSummaryAmounts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentWorkspace, refreshKey, localRefresh, debouncedSearch, statusFilter, freightModeFilter]);

  async function handleRowStatusChange(shipmentId: number, nextStatus: string) {
    if (!currentWorkspace) return;
    setBusyId(shipmentId);
    setRowError(null);
    try {
      await updateShipmentStatus(shipmentId, nextStatus, currentWorkspace.id);
      setLocalRefresh((n) => n + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(shipmentId: number) {
    if (!currentWorkspace) return;
    if (!window.confirm("Delete this shipment? This can't be undone.")) return;
    setBusyId(shipmentId);
    setRowError(null);
    try {
      await deleteShipment(shipmentId, currentWorkspace.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(shipmentId);
        return next;
      });
      setLocalRefresh((n) => n + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to delete shipment");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBulkStatusApply() {
    if (!currentWorkspace || selectedIds.size === 0) return;
    setBulkBusy(true);
    setRowError(null);
    try {
      await bulkUpdateShipmentStatus(Array.from(selectedIds), bulkStatus, currentWorkspace.id);
      setSelectedIds(new Set());
      setLocalRefresh((n) => n + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDatesApply() {
    if (!currentWorkspace || selectedIds.size === 0) return;
    if (!bulkShipmentDate && !bulkEta) return;
    setBulkBusy(true);
    setRowError(null);
    try {
      await bulkUpdateShipmentDates(
        Array.from(selectedIds),
        { shipment_date: bulkShipmentDate || undefined, eta: bulkEta || undefined },
        currentWorkspace.id
      );
      setSelectedIds(new Set());
      setBulkShipmentDate("");
      setBulkEta("");
      setLocalRefresh((n) => n + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to update dates");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (!currentWorkspace || selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} shipment(s)? This can't be undone.`)) return;
    setBulkBusy(true);
    setRowError(null);
    try {
      await bulkDeleteShipments(Array.from(selectedIds), currentWorkspace.id);
      setSelectedIds(new Set());
      setLocalRefresh((n) => n + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Failed to delete shipments");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageIds = shipments.map((s) => s.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const hasFilters = debouncedSearch !== "" || statusFilter.length > 0;

  if (loading && !everLoaded) {
    return <p className="text-sm text-gray-500">Loading shipments…</p>;
  }

  if (error && !everLoaded) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (everLoaded && total === 0 && !loading && !hasFilters) {
    return <p className="text-sm text-gray-500">No shipments yet — upload a shipping document to get started.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalAllCounts = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
  const visibleColumnDefs = COLUMN_DEFS.filter((c) => visibleColumns.includes(c.key));
  const padding = ROW_PADDING[density];
  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, total);

  function renderHeaderCell(key: ColumnKey) {
    switch (key) {
      case "date":
        return <SortHeader key={key} label="Date" column="shipment_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />;
      case "customer":
        return <SortHeader key={key} label="Customer" column="customer" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />;
      case "route":
        return (
          <th key={key} className="py-2.5 pr-4 text-[11px] font-medium tracking-wide uppercase">
            Route
          </th>
        );
      case "mode":
        return (
          <th key={key} className="py-2.5 pr-4 text-[11px] font-medium tracking-wide uppercase">
            Mode
          </th>
        );
      case "status":
        return <SortHeader key={key} label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />;
      case "cost":
        return (
          <SortHeader
            key={key}
            label="Freight cost"
            column="cost"
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            align="right"
          />
        );
    }
  }

  function renderBodyCell(key: ColumnKey, s: Shipment) {
    switch (key) {
      case "date":
        return (
          <td key={key} className={`${padding} pr-4 whitespace-nowrap`}>
            <Link href={`/shipments/${s.id}`} className="transition-colors hover:text-gray-900 hover:underline">
              {s.shipment_date}
            </Link>
          </td>
        );
      case "customer":
        return (
          <td key={key} className={`${padding} pr-4`}>
            <span className="flex items-center gap-2.5">
              <Avatar name={s.customer_name || "—"} />
              {s.customer_name || "—"}
            </span>
          </td>
        );
      case "route":
        return (
          <td key={key} className={`${padding} pr-4 whitespace-nowrap`}>
            {s.origin_port || "—"} → {s.destination_port || "—"}
          </td>
        );
      case "mode":
        return (
          <td key={key} className={`${padding} pr-4`}>
            {s.freight_mode}
          </td>
        );
      case "status":
        return (
          <td key={key} className={`${padding} pr-4`}>
            {canEdit ? (
              <StatusSelect
                status={s.status}
                disabled={busyId === s.id}
                onChange={(next) => handleRowStatusChange(s.id, next)}
                label={`Status for shipment ${s.id}`}
              />
            ) : (
              <StatusBadge status={s.status} />
            )}
          </td>
        );
      case "cost":
        return (
          <td key={key} className={`${padding} pr-4 text-right font-medium whitespace-nowrap text-gray-900 tabular-nums`}>
            {s.freight_cost != null ? `${s.freight_cost.toFixed(2)} ${s.currency}` : "—"}
          </td>
        );
    }
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-baseline gap-2 border-b border-gray-100 px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Shipments</h2>
        <span className="text-[13px] text-gray-400">{total.toLocaleString()} records</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 pt-3.5 pb-2.5">
        <button
          onClick={() => setStatusFilter([])}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            statusFilter.length === 0
              ? "bg-black text-white"
              : "border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          All {totalAllCounts.toLocaleString()}
        </button>
        {SHIPMENT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
              statusFilter.includes(s)
                ? "bg-black text-white"
                : "border border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
            }`}
          >
            <StatusDot status={s} className={statusFilter.includes(s) ? "bg-white" : ""} />
            {statusLabel(s)} {(statusCounts[s] ?? 0).toLocaleString()}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search customer, port, cargo, container…"
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm transition-colors focus:border-gray-400 focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <Popover
            label="Filter"
            icon={<FilterIcon />}
            active={statusFilter.length > 0 || freightModeFilter.length > 0}
            panelClassName="w-64"
          >
            {() => (
              <div className="flex flex-col gap-3 p-1">
                <div>
                  <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-gray-400 uppercase">Status</p>
                  <div className="flex flex-col gap-0.5">
                    {SHIPMENT_STATUSES.map((s) => (
                      <label
                        key={s}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
                      >
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={statusFilter.includes(s)} onChange={() => toggleStatus(s)} />
                          <StatusDot status={s} />
                          <span className="capitalize">{statusLabel(s)}</span>
                        </span>
                        <span className="text-xs text-gray-400">{(statusCounts[s] ?? 0).toLocaleString()}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-gray-400 uppercase">Freight mode</p>
                  <div className="flex flex-col gap-0.5">
                    {FREIGHT_MODES.map((m) => (
                      <label key={m} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={freightModeFilter.includes(m)}
                          onChange={() => toggleFreightMode(m)}
                        />
                        {m}
                      </label>
                    ))}
                  </div>
                </div>
                {(statusFilter.length > 0 || freightModeFilter.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter([]);
                      setFreightModeFilter([]);
                    }}
                    className="self-start px-1 text-xs text-gray-500 underline-offset-2 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </Popover>

          <Popover label="View" icon={<ViewIcon />} panelClassName="w-72">
            {() => (
              <div className="flex flex-col gap-3 p-1">
                <div>
                  <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-gray-400 uppercase">Density</p>
                  <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
                    {(["compact", "default", "relaxed"] as Density[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDensity(d)}
                        className={`flex-1 rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
                          density === d ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-sm text-gray-700">
                  Summary row
                  <input
                    type="checkbox"
                    checked={showSummaryRow}
                    onChange={(e) => setShowSummaryRow(e.target.checked)}
                  />
                </label>

                <div>
                  <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-gray-400 uppercase">
                    Columns · {visibleColumns.length}/{COLUMN_DEFS.length}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {COLUMN_DEFS.map((c) => (
                      <label key={c.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(c.key)}
                          onChange={() => toggleColumn(c.key)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Popover>
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">{selectedIds.size} selected</span>
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedIds.size === 0}
              className="underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Clear selection
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              disabled={bulkBusy || selectedIds.size === 0}
              aria-label="Bulk status"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs capitalize disabled:opacity-40"
            >
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" onClick={handleBulkStatusApply} disabled={bulkBusy || selectedIds.size === 0}>
              Set status
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={bulkShipmentDate}
              onChange={(e) => setBulkShipmentDate(e.target.value)}
              disabled={bulkBusy || selectedIds.size === 0}
              aria-label="Bulk shipment date"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
            />
            <input
              type="date"
              value={bulkEta}
              onChange={(e) => setBulkEta(e.target.value)}
              disabled={bulkBusy || selectedIds.size === 0}
              aria-label="Bulk ETA"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs disabled:opacity-40"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBulkDatesApply}
              disabled={bulkBusy || selectedIds.size === 0 || (!bulkShipmentDate && !bulkEta)}
            >
              Set dates
            </Button>
          </div>

          <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={bulkBusy || selectedIds.size === 0}>
            Delete selected
          </Button>
        </div>
      )}

      {rowError && <p className="px-4 pt-3 text-sm text-red-600">{rowError}</p>}

      {everLoaded && total === 0 && !loading && hasFilters ? (
        <p className="p-4 text-sm text-gray-500">No shipments match your search/filters.</p>
      ) : (
        <>
          <div className="relative">
            {loading && (
              <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
                <div
                  className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
                  role="status"
                  aria-label="Loading"
                />
              </div>
            )}

            <div
              className={`w-full overflow-x-auto transition-opacity ${loading ? "pointer-events-none opacity-50" : ""}`}
            >
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/60 text-gray-500">
                    {canEdit && (
                      <th className="py-2.5 pr-2 pl-4 font-medium">
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={toggleAllOnPage}
                          aria-label="Select all on page"
                        />
                      </th>
                    )}
                    {visibleColumnDefs.map((c) => renderHeaderCell(c.key))}
                    {canEdit && <th className="py-2.5 pr-4 pl-4 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50">
                      {canEdit && (
                        <td className={`${padding} pr-2 pl-4`}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleRow(s.id)}
                            aria-label={`Select shipment ${s.id}`}
                          />
                        </td>
                      )}
                      {visibleColumnDefs.map((c) => renderBodyCell(c.key, s))}
                      {canEdit && (
                        <td className={`${padding} pr-4 pl-4 text-right`}>
                          <button
                            onClick={() => handleDelete(s.id)}
                            disabled={busyId === s.id}
                            className="text-xs text-gray-400 transition-colors hover:text-red-600 disabled:opacity-50"
                            aria-label={`Delete shipment ${s.id}`}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {showSummaryRow && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/60 text-xs text-gray-500">
                      {canEdit && <td className="py-2 pr-2 pl-4" />}
                      {visibleColumnDefs.map((c, i) => (
                        <td
                          key={c.key}
                          className={`py-2 pr-4 whitespace-nowrap ${
                            c.key === "cost" ? "text-right font-medium text-gray-700 tabular-nums" : ""
                          }`}
                        >
                          {i === 0 && `${total.toLocaleString()} rows`}
                          {c.key === "cost" && `SUM ${formatAmounts(summaryAmounts)}`}
                        </td>
                      ))}
                      {canEdit && <td className="py-2 pr-4 pl-4" />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 p-4 text-sm text-gray-500">
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()}
              </span>
              <label className="flex items-center gap-1.5">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  aria-label="Rows per page"
                  className="rounded-md border border-gray-300 px-1.5 py-1 text-sm"
                >
                  {ROWS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={loading || page === 0}
                aria-label="Previous page"
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronIcon direction="left" />
              </button>
              {pageWindow(page, totalPages).map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`ellipsis-${i}`} className="px-1.5 text-gray-400">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={loading}
                    aria-current={p === page ? "page" : undefined}
                    className={`min-w-[1.75rem] rounded-md px-1.5 py-1 text-sm tabular-nums transition-colors ${
                      p === page ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={loading || page + 1 >= totalPages}
                aria-label="Next page"
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronIcon direction="right" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
