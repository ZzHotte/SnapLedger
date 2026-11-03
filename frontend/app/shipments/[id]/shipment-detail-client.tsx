"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import {
  addQuote,
  addTrackingEvent,
  ApiError,
  deleteShipment,
  fetchCarriers,
  fetchShipment,
  updateShipmentStatus,
  type Carrier,
  type ShipmentDetail,
} from "@/lib/api";
import { SHIPMENT_STATUSES } from "@/lib/constants";
import { daysFromToday, scheduleHint } from "@/lib/schedule";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Popover from "@/components/ui/Popover";

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

// The happy path a shipment moves along — cancelled sits outside it.
const PROGRESS_STEPS = SHIPMENT_STATUSES.filter((s) => s !== "cancelled");

function StatusProgress({ status }: { status: string }) {
  if (status === "cancelled") {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">This shipment was cancelled.</p>;
  }
  const current = PROGRESS_STEPS.indexOf(status as (typeof PROGRESS_STEPS)[number]);
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="Shipment progress">
      {PROGRESS_STEPS.map((step, i) => (
        <li key={step} aria-current={i === current ? "step" : undefined}>
          <div className={`h-1 rounded-full ${i <= current ? "bg-gray-900" : "bg-gray-200"}`} />
          <p
            className={`mt-1.5 truncate text-[11px] capitalize ${
              i === current ? "font-semibold text-gray-900" : i < current ? "text-gray-600" : "text-gray-400"
            }`}
          >
            {statusLabel(step)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function ScheduleValue({ kind, date, status }: { kind: "etd" | "eta"; date: string | null; status: string }) {
  if (!date) return <span className="text-gray-400">Not scheduled</span>;
  const hint = scheduleHint(kind, date, status);
  return (
    <span className="tabular-nums">
      {date}
      {hint && (
        <span className={`ml-1.5 text-xs font-medium ${hint.tone === "late" ? "text-red-600" : "text-amber-600"}`}>
          {hint.label}
        </span>
      )}
    </span>
  );
}

function transitDays(etd: string | null, eta: string | null): number | null {
  if (!etd || !eta) return null;
  return daysFromToday(eta) - daysFromToday(etd);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard blocked (insecure context / permissions) — nothing useful to show
        }
      }}
      aria-label={`Copy ${text}`}
      className="rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export default function ShipmentDetailClient({ shipmentId }: { shipmentId: number }) {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [eventStatus, setEventStatus] = useState<string>(SHIPMENT_STATUSES[0]);
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingEvent, setSavingEvent] = useState(false);

  const [quoteCarrierId, setQuoteCarrierId] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [savingQuote, setSavingQuote] = useState(false);

  const canEdit = currentWorkspace?.role !== "viewer";

  async function load() {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      // Independent requests — fetchCarriers doesn't need the shipment, and
      // fetchShipment doesn't need the carrier list — so run them together
      // instead of waiting on one before starting the other.
      const [data, carrierList] = await Promise.all([
        fetchShipment(shipmentId, currentWorkspace.id),
        fetchCarriers(currentWorkspace.id),
      ]);
      setShipment(data);
      setCarriers(carrierList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load shipment");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, shipmentId]);

  async function handleStatusChange(status: string) {
    if (!currentWorkspace) return;
    setError(null);
    try {
      await updateShipmentStatus(shipmentId, status, currentWorkspace.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    }
  }

  async function handleDelete() {
    if (!currentWorkspace) return;
    if (!window.confirm("Delete this shipment? This can't be undone.")) return;
    setError(null);
    try {
      await deleteShipment(shipmentId, currentWorkspace.id);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete shipment");
    }
  }

  async function handleAddEvent() {
    if (!currentWorkspace) return;
    setSavingEvent(true);
    setError(null);
    try {
      await addTrackingEvent(
        shipmentId,
        { status: eventStatus, location: eventLocation || null, event_date: eventDate },
        currentWorkspace.id
      );
      setEventLocation("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add tracking event");
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleAddQuote() {
    if (!currentWorkspace || !quoteCarrierId || !quoteAmount) return;
    setSavingQuote(true);
    setError(null);
    try {
      await addQuote(
        shipmentId,
        { carrier_id: Number(quoteCarrierId), amount: parseFloat(quoteAmount), currency: quoteCurrency.toUpperCase() },
        currentWorkspace.id
      );
      setQuoteAmount("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add quote");
    } finally {
      setSavingQuote(false);
    }
  }

  if (authLoading || !user || loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (error && !shipment) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/dashboard" className="text-sm text-gray-500 underline">
          Back
        </Link>
      </main>
    );
  }

  if (!shipment) return null;

  const transit = transitDays(shipment.etd, shipment.eta);
  const inputClass = "rounded-md border border-gray-300 px-2 py-1.5 text-sm";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xl font-semibold">{shipment.ref}</h1>
              <CopyButton text={shipment.ref} />
            </div>
            <p className="mt-0.5 text-sm font-medium text-gray-900">{shipment.customer_name || "No customer"}</p>
            <p className="text-sm text-gray-600">
              {shipment.origin_port || "—"} → {shipment.destination_port || "—"} · {shipment.freight_mode}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={shipment.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={!canEdit}
              aria-label="Status"
              className={`${inputClass} capitalize disabled:opacity-50`}
            >
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            {canEdit && (
              <Popover label="More" icon={<MoreIcon />} panelClassName="w-44">
                {(close) => (
                  <button
                    onClick={() => {
                      close();
                      handleDelete();
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete shipment
                  </button>
                )}
              </Popover>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <StatusProgress status={shipment.status} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Route &amp; schedule</CardTitle>
            </CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field label="Port of loading">{shipment.origin_port || "—"}</Field>
              <Field label="Port of discharge">{shipment.destination_port || "—"}</Field>
              <Field label="Mode">{shipment.freight_mode}</Field>
              <Field label="ETD">
                <ScheduleValue kind="etd" date={shipment.etd} status={shipment.status} />
              </Field>
              <Field label="ETA">
                <ScheduleValue kind="eta" date={shipment.eta} status={shipment.status} />
              </Field>
              <Field label="Transit">{transit !== null ? `${transit} days` : "—"}</Field>
              <Field label="Carrier">{shipment.carrier_name || "—"}</Field>
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cargo</CardTitle>
            </CardHeader>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-3">
                <Field label="Description">{shipment.cargo_description || "—"}</Field>
              </div>
              <Field label="Gross weight">
                {shipment.weight_kg != null ? `${shipment.weight_kg.toLocaleString()} kg` : "—"}
              </Field>
              <Field label="Container">
                <span className="font-mono">{shipment.container_no || "—"}</span>
              </Field>
            </dl>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financials</CardTitle>
            </CardHeader>
            <dl className="mb-5">
              <Field label="Freight cost">
                <span className="text-lg font-semibold tabular-nums">
                  {shipment.freight_cost != null
                    ? `${shipment.freight_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${shipment.currency}`
                    : "—"}
                </span>
              </Field>
            </dl>
            <p className="mb-2 text-xs font-medium text-gray-500">Carrier quotes</p>
            {shipment.quotes.length === 0 ? (
              <p className="text-sm text-gray-500">No quotes yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                {shipment.quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{q.carrier_name}</span>
                    <span className="tabular-nums">
                      {q.amount.toFixed(2)} {q.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={quoteCarrierId} onChange={(e) => setQuoteCarrierId(e.target.value)} className={inputClass}>
                  <option value="">Select carrier…</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Amount"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  className={`${inputClass} w-28`}
                />
                <input
                  value={quoteCurrency}
                  onChange={(e) => setQuoteCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  aria-label="Quote currency"
                  className={`${inputClass} w-16 uppercase`}
                />
                <Button size="sm" variant="primary" onClick={handleAddQuote} disabled={savingQuote || !quoteCarrierId || !quoteAmount}>
                  {savingQuote ? "Adding…" : "Add quote"}
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tracking</CardTitle>
            </CardHeader>
            {shipment.tracking_events.length === 0 ? (
              <p className="text-sm text-gray-500">No tracking events yet.</p>
            ) : (
              <ol>
                {shipment.tracking_events.map((e, i) => (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < shipment.tracking_events.length - 1 && (
                      <span className="absolute top-3 left-[4px] h-full w-px bg-gray-200" />
                    )}
                    <span className="relative mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full bg-gray-900" />
                    <div className="text-sm">
                      <p className="font-medium capitalize">{statusLabel(e.status)}</p>
                      <p className="text-xs text-gray-500">
                        <span className="tabular-nums">{e.event_date}</span>
                        {(e.location || e.note) && ` · ${e.location || e.note}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {canEdit && (
              <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
                <div className="flex gap-2">
                  <select
                    value={eventStatus}
                    onChange={(e) => setEventStatus(e.target.value)}
                    aria-label="Event status"
                    className={`${inputClass} flex-1 capitalize`}
                  >
                    {SHIPMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    aria-label="Event date"
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="Location"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <Button size="sm" variant="primary" onClick={handleAddEvent} disabled={savingEvent}>
                    {savingEvent ? "Adding…" : "Add event"}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            {shipment.document_file_url ? (
              <a
                href={shipment.document_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Source document
                <span className="text-xs text-gray-400">Open ↗</span>
              </a>
            ) : (
              <p className="text-sm text-gray-500">Entered manually — no source document.</p>
            )}
          </Card>

          <Card>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Job date">
                <span className="tabular-nums">{shipment.shipment_date}</span>
              </Field>
              <Field label="Created">
                <span className="tabular-nums">{new Date(shipment.created_at).toLocaleDateString()}</span>
              </Field>
            </dl>
          </Card>
        </div>
      </div>
    </main>
  );
}
