"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import Badge, { PreviewNotice } from "@/components/ui/Badge";
import { TRIPS } from "../sample-data";

type Fix = { lat: number; lng: number; accuracy: number; at: number };

const STEPS = ["Arrived at pickup", "Loaded", "Arrived at delivery", "Delivered (POD)"] as const;

// The driver-facing phone view. In the real build this opens from an SMS/
// WeChat magic link (no password) and POSTs each fix to the backend; here it
// only reads the phone's GPS locally so the permission + battery UX can be tried.
export default function DriverPage() {
  const trip = TRIPS[0];
  const [sharing, setSharing] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const watchId = useRef<number | null>(null);

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
    setGeoError(null);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) =>
        setFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp }),
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "Location permission denied — enable it in browser settings." : err.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
    setSharing(true);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 bg-gray-50 p-4">
      <PreviewNotice>Driver view — your location stays on this device.</PreviewNotice>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Current job</p>
          <Badge tone="amber">In transit</Badge>
        </div>
        <p className="mt-1 text-lg font-semibold">{trip.shipment_ref}</p>
        <p className="text-sm text-gray-600">{trip.customer}</p>
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="text-gray-400">From </span>
            {trip.from}
          </p>
          <p>
            <span className="text-gray-400">To </span>
            {trip.to}
          </p>
          {trip.container_no && (
            <p>
              <span className="text-gray-400">Container </span>
              <span className="font-mono">{trip.container_no}</span>
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Location sharing</p>
          <span className={`flex items-center gap-1.5 text-xs ${sharing ? "text-green-700" : "text-gray-500"}`}>
            <span className={`h-2 w-2 rounded-full ${sharing ? "animate-pulse bg-green-500" : "bg-gray-300"}`} />
            {sharing ? "Live" : "Off"}
          </span>
        </div>
        <Button variant={sharing ? "secondary" : "primary"} className="mt-3 w-full py-3 text-base" onClick={toggleSharing}>
          {sharing ? "Stop sharing" : "Start sharing location"}
        </Button>
        {geoError && <p className="mt-2 text-xs text-red-600">{geoError}</p>}
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
