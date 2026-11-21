"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Button, ButtonLink } from "@/components/ui/Button";
import Badge, { PreviewNotice, type BadgeTone } from "@/components/ui/Badge";
import SegmentedControl from "@/components/ui/SegmentedControl";
import StatTile from "@/components/ui/StatTile";
import { TRIPS, type Trip, type TripStatus } from "./sample-data";
import TransportMap, { PIN_COLOR } from "./TransportMap";

type Filter = "active" | "all" | "offline";

const STATUS_TONE: Record<TripStatus, BadgeTone> = {
  assigned: "gray",
  to_pickup: "blue",
  loaded: "indigo",
  in_transit: "amber",
  delivered: "green",
  offline: "red",
};

function statusLabel(s: TripStatus): string {
  return s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}

function TripDetail({ trip }: { trip: Trip }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{trip.vehicle}</p>
          <p className="text-xs text-gray-500">
            {trip.driver} · {trip.phone}
          </p>
        </div>
        <Badge tone={STATUS_TONE[trip.status]}>{statusLabel(trip.status)}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-gray-500">Job</dt>
        <dd className="text-right font-medium">{trip.shipment_ref}</dd>
        <dt className="text-gray-500">Container</dt>
        <dd className="text-right font-mono">{trip.container_no ?? "—"}</dd>
        <dt className="text-gray-500">From</dt>
        <dd className="text-right">{trip.from}</dd>
        <dt className="text-gray-500">To</dt>
        <dd className="text-right">{trip.to}</dd>
        <dt className="text-gray-500">Speed</dt>
        <dd className="text-right tabular-nums">{trip.speed_kmh} km/h</dd>
        <dt className="text-gray-500">Last ping</dt>
        <dd className="text-right">{minutesAgo(trip.last_ping)}</dd>
        <dt className="text-gray-500">ETA</dt>
        <dd className="text-right tabular-nums">{trip.eta ?? "—"}</dd>
      </dl>
      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1">
          Share tracking link
        </Button>
        <Button size="sm" className="flex-1">
          Trip history
        </Button>
      </div>
    </div>
  );
}

export default function TransportPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(TRIPS[0].id);

  const visible = useMemo(() => {
    if (filter === "all") return TRIPS;
    if (filter === "offline") return TRIPS.filter((t) => t.status === "offline");
    return TRIPS.filter((t) => t.status !== "delivered");
  }, [filter]);

  const selected = TRIPS.find((t) => t.id === selectedId) ?? null;
  const moving = TRIPS.filter((t) => t.speed_kmh > 0).length;
  const offline = TRIPS.filter((t) => t.status === "offline").length;
  const delivered = TRIPS.filter((t) => t.status === "delivered").length;

  if (authLoading || !user || !currentWorkspace) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Transport</h1>
          <p className="text-sm text-gray-500">Live position of every truck on a job, shared from the driver&apos;s phone.</p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/transport/driver">Driver app preview</ButtonLink>
          <Button variant="primary">Assign driver</Button>
        </div>
      </div>

      <PreviewNotice>Sample vehicles — live GPS sharing isn&apos;t wired up yet.</PreviewNotice>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Vehicles on job" value={TRIPS.length - delivered} />
        <StatTile label="Moving now" value={moving} />
        <StatTile label="Delivered today" value={delivered} />
        <StatTile label="Signal lost" value={offline} hint="no ping > 15 min" />
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-3">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            aria-label="Vehicle filter"
            options={[
              { value: "active", label: "Active" },
              { value: "offline", label: "Offline" },
              { value: "all", label: "All" },
            ]}
          />
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedId(t.id)}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                    t.id === selectedId ? "bg-gray-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: PIN_COLOR[t.status] }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{t.driver}</span>
                      <span className="shrink-0 text-xs text-gray-400">{minutesAgo(t.last_ping)}</span>
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {t.shipment_ref} · {t.to}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-500">No vehicles.</li>}
          </ul>
          {selected && <TripDetail trip={selected} />}
        </div>

        <TransportMap trips={visible} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </main>
  );
}
