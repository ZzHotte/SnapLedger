"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, fetchShipments, type Shipment } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

const PAGE_SIZE = 50;

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

export default function ShipmentsTable({ refreshKey }: { refreshKey: number }) {
  const { currentWorkspace } = useWorkspace();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [everLoaded, setEverLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switching workspaces or adding a shipment invalidates whatever page we were
  // on — jump back to the first page rather than showing a now-meaningless offset.
  // Adjusted during render (React's documented pattern for this — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a separate effect: a second effect would still fire the fetch
  // effect below once with the stale `page` before the reset lands, wasting a
  // request on every workspace switch/refresh that happens while page > 0.
  const resetKey = `${currentWorkspace?.id ?? "none"}:${refreshKey}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setPage(0);
  }

  useEffect(() => {
    if (!currentWorkspace) return;
    const workspaceId = currentWorkspace.id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchShipments(workspaceId, PAGE_SIZE, page * PAGE_SIZE);
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
  }, [refreshKey, currentWorkspace, page]);

  if (loading && !everLoaded) {
    return <p className="text-sm text-gray-500">Loading shipments…</p>;
  }

  if (error && !everLoaded) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (everLoaded && total === 0 && !loading) {
    return <p className="text-sm text-gray-500">No shipments yet — upload a shipping document to get started.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="w-full">
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
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Route</th>
                <th className="py-2 pr-4 font-medium">Mode</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium text-right">Freight cost</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
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
                  <td className="py-2 pr-4 capitalize">{statusLabel(s.status)}</td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap">
                    {s.freight_cost != null ? `${s.freight_cost.toFixed(2)} ${s.currency}` : "—"}
                  </td>
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
    </div>
  );
}
