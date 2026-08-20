"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  deleteShipment,
  fetchShipments,
  updateShipmentStatus,
  type Shipment,
  type ShipmentSortBy,
  type SortDir,
} from "@/lib/api";
import { SHIPMENT_STATUSES } from "@/lib/constants";
import { useWorkspace } from "@/lib/workspace-context";

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

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

function StatusSelect({
  status,
  disabled,
  onChange,
}: {
  status: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <select
      value={status}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
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
    <th className={`py-2 pr-4 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-black ${active ? "text-black" : ""}`}
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

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search customer, port, cargo, container…"
          className="w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {SHIPMENT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                statusFilter.includes(s)
                  ? "bg-black text-white"
                  : "border border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              {statusLabel(s)}
            </button>
          ))}
          {statusFilter.length > 0 && (
            <button
              onClick={() => setStatusFilter([])}
              className="px-2 py-1 text-xs text-gray-500 underline-offset-2 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded-md bg-gray-50 px-3 py-1.5 text-sm text-gray-600">
          <span>{selectedIds.size} selected</span>
          <button onClick={() => setSelectedIds(new Set())} className="underline-offset-2 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      {rowError && <p className="mb-2 text-sm text-red-600">{rowError}</p>}

      {everLoaded && total === 0 && !loading && hasFilters ? (
        <p className="text-sm text-gray-500">No shipments match your search/filters.</p>
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
                  <tr className="border-b border-gray-200 text-gray-500">
                    {canEdit && (
                      <th className="py-2 pr-2 font-medium">
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
                    <th className="py-2 pr-4 font-medium">Route</th>
                    <th className="py-2 pr-4 font-medium">Mode</th>
                    <SortHeader label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader
                      label="Freight cost"
                      column="cost"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    {canEdit && <th className="py-2 pl-4 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100">
                      {canEdit && (
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleRow(s.id)}
                            aria-label={`Select shipment ${s.id}`}
                          />
                        </td>
                      )}
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <Link href={`/shipments/${s.id}`} className="hover:underline">
                          {s.shipment_date}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{s.customer_name || "—"}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {s.origin_port || "—"} → {s.destination_port || "—"}
                      </td>
                      <td className="py-2 pr-4">{s.freight_mode}</td>
                      <td className="py-2 pr-4">
                        {canEdit ? (
                          <StatusSelect
                            status={s.status}
                            disabled={busyId === s.id}
                            onChange={(next) => handleRowStatusChange(s.id, next)}
                          />
                        ) : (
                          <StatusBadge status={s.status} />
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {s.freight_cost != null ? `${s.freight_cost.toFixed(2)} ${s.currency}` : "—"}
                      </td>
                      {canEdit && (
                        <td className="py-2 pl-4 text-right">
                          <button
                            onClick={() => handleDelete(s.id)}
                            disabled={busyId === s.id}
                            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
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

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
            <span>{total} shipments</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={loading || page === 0}
                className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={loading || page + 1 >= totalPages}
                className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
