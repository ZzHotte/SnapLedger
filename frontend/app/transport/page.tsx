"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Button, ButtonLink } from "@/components/ui/Button";
import Badge, { PreviewNotice, type BadgeTone } from "@/components/ui/Badge";
import SegmentedControl from "@/components/ui/SegmentedControl";
import StatTile from "@/components/ui/StatTile";
import { MAP_BOUNDS, TRIPS, type Trip, type TripStatus } from "./sample-data";

type Filter = "active" | "all" | "offline";

const STATUS_TONE: Record<TripStatus, BadgeTone> = {
  assigned: "gray",
  to_pickup: "blue",
  loaded: "indigo",
  in_transit: "amber",
  delivered: "green",
  offline: "red",
};

const PIN_COLOR: Record<TripStatus, string> = {
  assigned: "#6b7280",
  to_pickup: "#2563eb",
  loaded: "#4f46e5",
  in_transit: "#d97706",
  delivered: "#16a34a",
  offline: "#dc2626",
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

// Equirectangular projection into the placeholder canvas — good enough for a
// metro-sized box; the real map (Mapbox/MapLibre) replaces this entirely.
function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 100;
  const y = ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 100;
  return { x, y };
}

function MapCanvas({ trips, selectedId, onSelect }: { trips: Trip[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-lg border border-gray-200 bg-[#eef2f5]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dde3ea" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* Stylised Port Phillip Bay so the canvas reads as "Melbourne", not a blank grid. */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 30 100 Q 38 70 45 62 Q 52 58 60 64 Q 66 75 62 100 Z" fill="#cfe0ee" />
      </svg>

      {trips.map((t) => {
        const { x, y } = project(t.lat, t.lng);
        const selected = t.id === selectedId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-label={`${t.vehicle} — ${statusLabel(t.status)}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span
              className={`block rounded-full border-2 border-white shadow transition-transform ${selected ? "h-5 w-5 scale-110" : "h-3.5 w-3.5 group-hover:scale-125"}`}
              style={{ background: PIN_COLOR[t.status] }}
            />
            {t.status === "in_transit" && (
              <span className="absolute inset-0 -z-10 animate-ping rounded-full opacity-40" style={{ background: PIN_COLOR[t.status] }} />
            )}
            <span
              className={`absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-white px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              {t.driver}
            </span>
          </button>
        );
      })}

      <div className="absolute bottom-3 left-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] text-gray-500 shadow-sm">
        Map tiles not connected — pin positions are projected from sample GPS pings.
      </div>
    </div>
  );
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6">
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

        <MapCanvas trips={visible} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </main>
  );
}
