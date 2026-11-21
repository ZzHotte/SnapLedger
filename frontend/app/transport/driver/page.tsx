"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ApiError, fetchShipments, postVehiclePing, type Shipment } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import Badge, { PreviewNotice } from "@/components/ui/Badge";

type Fix = { lat: number; lng: number; accuracy: number; at: number };

const STEPS = ["Arrived at pickup", "Loaded", "Arrived at delivery", "Delivered (POD)"] as const;

// Pings faster than this just burn battery/data without the dispatcher map
// (which polls on its own interval) ever seeing the extra resolution.
const MIN_PING_INTERVAL_MS = 8000;

// The driver-facing phone view. A real build opens this from an SMS/WeChat
// magic link (no password) rather than a normal login — that's a bigger
// follow-up on its own; for now it reuses the driver's own Shiplog account
// so the actual GPS -> backend -> dispatcher-map path can be tried end to end.
export default function DriverPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentId, setShipmentId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sharing, setSharing] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!currentWorkspace) return;
    // Anything still worth a driver's attention — not a settled job.
    fetchShipments(currentWorkspace.id, 50, 0, {
      status: ["inquiry", "quoted", "booked", "in_transit", "arrived", "customs"],
    })
      .then((result) => {
        setShipments(result.items);
        setShipmentId((current) => current ?? result.items[0]?.id ?? null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load shipments"));
  }, [currentWorkspace]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  function toggleSharing() {
    if (sharing) {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setSharing(false);
      return;
    }
    if (!("geolocation" in navigator)) {
      setGeoError("This browser can't read GPS.");
      return;
    }
    if (!currentWorkspace || !shipmentId) {
      setGeoError("Pick a job first.");
      return;
    }
    setGeoError(null);
    setPingError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp };
        setFix(next);
        const now = Date.now();
        if (now - lastSentAt.current < MIN_PING_INTERVAL_MS) return;
        lastSentAt.current = now;
        postVehiclePing(
          { shipment_id: shipmentId, lat: next.lat, lng: next.lng, accuracy_m: next.accuracy },
          currentWorkspace.id
        ).catch((err) => setPingError(err instanceof ApiError ? err.message : "Couldn't reach the server"));
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission denied — enable it in browser settings." : err.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
    setSharing(true);
  }

  const trip = shipments.find((s) => s.id === shipmentId) ?? null;

  if (authLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-gray-600">Log in to share your location for a job.</p>
        <Link href="/login" className="text-sm font-medium text-gray-900 underline">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 bg-gray-50 p-4">
      <PreviewNotice>Driver view — opens from a magic link in the real build; this reuses your login instead.</PreviewNotice>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-2 text-xs text-gray-500">Current job</p>
        <select
          value={shipmentId ?? ""}
          onChange={(e) => setShipmentId(Number(e.target.value))}
          disabled={sharing || shipments.length === 0}
          className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm disabled:opacity-50"
        >
          {shipments.length === 0 && <option value="">No open jobs</option>}
          {shipments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.ref} · {s.customer_name ?? "No customer"}
            </option>
          ))}
        </select>
        {loadError && <p className="mt-2 text-xs text-red-600">{loadError}</p>}

        {trip && (
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Status</span>
              <Badge tone="amber">{trip.status.replace("_", " ")}</Badge>
            </div>
            <p>
              <span className="text-gray-400">From </span>
              {trip.origin_port || "—"}
            </p>
            <p>
              <span className="text-gray-400">To </span>
              {trip.destination_port || "—"}
            </p>
            {trip.container_no && (
              <p>
                <span className="text-gray-400">Container </span>
                <span className="font-mono">{trip.container_no}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Location sharing</p>
          <span className={`flex items-center gap-1.5 text-xs ${sharing ? "text-green-700" : "text-gray-500"}`}>
            <span className={`h-2 w-2 rounded-full ${sharing ? "animate-pulse bg-green-500" : "bg-gray-300"}`} />
            {sharing ? "Live" : "Off"}
          </span>
        </div>
        <Button
          variant={sharing ? "secondary" : "primary"}
          className="mt-3 w-full py-3 text-base"
          onClick={toggleSharing}
          disabled={!shipmentId}
        >
          {sharing ? "Stop sharing" : "Start sharing location"}
        </Button>
        {geoError && <p className="mt-2 text-xs text-red-600">{geoError}</p>}
        {pingError && <p className="mt-2 text-xs text-red-600">Last update didn&apos;t reach the server: {pingError}</p>}
        {fix && (
          <p className="mt-2 font-mono text-xs text-gray-500">
            {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} · ±{Math.round(fix.accuracy)} m ·{" "}
            {new Date(fix.at).toLocaleTimeString()}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium">Job progress</p>
        <ol className="space-y-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  i < step ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={i < step ? "text-gray-900" : "text-gray-500"}>{s}</span>
            </li>
          ))}
        </ol>
        {step < STEPS.length && (
          <Button variant="primary" className="mt-4 w-full py-3 text-base" onClick={() => setStep(step + 1)}>
            {STEPS[step]}
          </Button>
        )}
      </div>
    </main>
  );
}
