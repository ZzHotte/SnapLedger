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
  updateShipmentStatus,
  type Shipment,
  type ShipmentSortBy,
  type SortDir,
} from "@/lib/api";
import { SHIPMENT_STATUSES } from "@/lib/constants";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/Button";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

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
  const [page, setPage] = useState(0);
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
  const [sortBy, setSortBy] = useState<ShipmentSortBy>("shipment_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  function toggleStatus(s: string) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
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
  const resetKey = `${currentWorkspace?.id ?? "none"}:${refreshKey}:${debouncedSearch}:${statusFilter.join(",")}:${sortBy}:${sortDir}`;
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
        const data = await fetchShipments(workspaceId, PAGE_SIZE, page * PAGE_SIZE, {
          q: debouncedSearch || undefined,
          status: statusFilter.length > 0 ? statusFilter : undefined,
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
  }, [refreshKey, currentWorkspace, page, debouncedSearch, statusFilter, sortBy, sortDir, localRefresh]);

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalAllCounts = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-baseline gap-2 border-b border-gray-100 px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-gray-900">Shipments</h2>
        <span className="text-[13px] text-gray-400">{total.toLocaleString()} records</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search customer, port, cargo, container…"
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm transition-colors focus:border-gray-400 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5">
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
                    <SortHeader label="Date" column="shipment_date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Customer" column="customer" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    <th className="py-2.5 pr-4 text-[11px] font-medium tracking-wide uppercase">Route</th>
                    <th className="py-2.5 pr-4 text-[11px] font-medium tracking-wide uppercase">Mode</th>
                    <SortHeader label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader
                      label="Freight cost"
                      column="cost"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    {canEdit && <th className="py-2.5 pr-4 pl-4 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50">
                      {canEdit && (
                        <td className="py-2.5 pr-2 pl-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleRow(s.id)}
                            aria-label={`Select shipment ${s.id}`}
                          />
                        </td>
                      )}
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <Link href={`/shipments/${s.id}`} className="transition-colors hover:text-gray-900 hover:underline">
                          {s.shipment_date}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={s.customer_name || "—"} />
                          {s.customer_name || "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {s.origin_port || "—"} → {s.destination_port || "—"}
                      </td>
                      <td className="py-2.5 pr-4">{s.freight_mode}</td>
                      <td className="py-2.5 pr-4">
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
                      <td className="py-2.5 pr-4 text-right font-medium whitespace-nowrap text-gray-900 tabular-nums">
                        {s.freight_cost != null ? `${s.freight_cost.toFixed(2)} ${s.currency}` : "—"}
                      </td>
                      {canEdit && (
                        <td className="py-2.5 pr-4 pl-4 text-right">
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
              </table>
            </div>
          </div>

          {error && <p className="px-4 pt-2 text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between border-t border-gray-100 p-4 text-sm text-gray-500">
            <span>{total} shipments</span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={loading || page === 0}
              >
                Prev
              </Button>
              <span className="tabular-nums">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={loading || page + 1 >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
