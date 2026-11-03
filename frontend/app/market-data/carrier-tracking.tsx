"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import Badge, { PreviewNotice } from "@/components/ui/Badge";
import Dropdown from "@/components/ui/Dropdown";
import { CARRIERS, detectCarrier, guessReferenceKind, type ReferenceKind } from "./carriers";

const AUTO = "auto";

type Milestone = { event: string; location: string; at: string; done: boolean; vessel?: string };

// Shape of a normalised tracking result — what every carrier adapter maps its
// own payload into, so the UI never branches on carrier.
type TrackingResult = {
  carrier: string;
  reference: string;
  kind: ReferenceKind;
  pol: string;
  pod: string;
  vessel: string;
  eta: string;
  status: string;
  milestones: Milestone[];
};

function sampleResult(reference: string, carrierName: string, kind: ReferenceKind): TrackingResult {
  return {
    carrier: carrierName,
    reference: reference.toUpperCase(),
    kind,
    pol: "Qingdao, CN",
    pod: "Melbourne, AU",
    vessel: "SAMPLE VESSEL / 045S",
    eta: "2026-11-18",
    status: "On water",
    milestones: [
      { event: "Empty container released", location: "Qingdao, CN", at: "2026-10-14 09:20", done: true },
      { event: "Gate in full", location: "Qingdao Qianwan Terminal", at: "2026-10-17 16:05", done: true },
      { event: "Loaded on vessel", location: "Qingdao, CN", at: "2026-10-20 03:41", done: true, vessel: "SAMPLE VESSEL / 045S" },
      { event: "Vessel departed", location: "Qingdao, CN", at: "2026-10-20 22:10", done: true },
      { event: "Vessel arrival (ETA)", location: "Melbourne, AU", at: "2026-11-18 06:00", done: false },
      { event: "Discharged", location: "Swanson Dock, Melbourne", at: "—", done: false },
      { event: "Gate out full", location: "Swanson Dock, Melbourne", at: "—", done: false },
    ],
  };
}

function TrackingResultCard({ result }: { result: TrackingResult }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <p className="text-xs text-gray-500">
            {result.carrier} · {result.kind === "container" ? "Container" : result.kind === "bl" ? "Bill of lading" : "Booking"}
          </p>
          <p className="font-mono text-lg font-semibold">{result.reference}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="amber">{result.status}</Badge>
          <Button size="sm">Watch</Button>
          <Button size="sm">Link to shipment</Button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-b border-gray-200 p-4 text-sm md:grid-cols-4">
        {[
          ["Port of loading", result.pol],
          ["Port of discharge", result.pod],
          ["Vessel / voyage", result.vessel],
          ["ETA", result.eta],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <ol className="p-4">
        {result.milestones.map((m, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < result.milestones.length - 1 && (
              <span className={`absolute top-3 left-[5px] h-full w-px ${m.done ? "bg-gray-900" : "bg-gray-200"}`} />
            )}
            <span
              className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${
                m.done ? "border-gray-900 bg-gray-900" : "border-gray-300 bg-white"
              }`}
            />
            <div className="flex flex-1 flex-wrap justify-between gap-x-4 text-sm">
              <div>
                <p className={m.done ? "font-medium text-gray-900" : "text-gray-500"}>{m.event}</p>
                <p className="text-xs text-gray-500">
                  {m.location}
                  {m.vessel && ` · ${m.vessel}`}
                </p>
              </div>
              <p className="text-xs tabular-nums text-gray-500">{m.at}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function CarrierTracking() {
  const [reference, setReference] = useState("");
  const [carrierCode, setCarrierCode] = useState<string>(AUTO);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detected = detectCarrier(reference);
  const effective = carrierCode === AUTO ? detected : (CARRIERS.find((c) => c.code === carrierCode) ?? null);

  function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    const ref = reference.trim();
    if (!ref) return;
    if (!effective) {
      setError("Couldn't tell the carrier from this number — pick one from the list.");
      setResult(null);
      return;
    }
    setError(null);
    setResult(sampleResult(ref, effective.name, guessReferenceKind(ref)));
  }

  return (
    <div className="flex flex-col gap-6">
      <PreviewNotice>Results below are a sample timeline — carrier lookups aren&apos;t connected yet.</PreviewNotice>

      <form onSubmit={handleTrack} className="rounded-lg border border-gray-200 bg-white p-4">
        <label htmlFor="tracking-ref" className="text-sm font-medium text-gray-700">
          Track a container, B/L or booking
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="tracking-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. MSKU7342110 or HLCUSHA2410ABC1"
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm uppercase placeholder:font-sans placeholder:normal-case"
          />
          <Dropdown
            value={carrierCode}
            onChange={setCarrierCode}
            aria-label="Carrier"
            options={[
              { value: AUTO, label: detected ? `Auto · ${detected.name}` : "Auto-detect carrier" },
              ...CARRIERS.map((c) => ({ value: c.code, label: c.name, meta: c.code })),
            ]}
          />
          <Button type="submit" variant="primary" disabled={!reference.trim()}>
            Track
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Up to 50 numbers at once (one per line) in bulk mode · tracked numbers can be watched for ETA changes.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {result && <TrackingResultCard result={result} />}

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-700">Carriers</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CARRIERS.map((c) => (
            <div key={c.code} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-900 text-[10px] font-bold text-white">
                  {c.code}
                </span>
                <span className="truncate text-sm font-medium">{c.name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{c.prefixes.length ? c.prefixes.slice(0, 3).join(" · ") : "—"}</span>
                <a href={c.website} target="_blank" rel="noreferrer" className="text-gray-500 underline hover:text-black">
                  Website
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
