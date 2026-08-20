"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import {
  addQuote,
  addTrackingEvent,
  ApiError,
  fetchCarriers,
  fetchShipment,
  updateShipmentStatus,
  type Carrier,
  type ShipmentDetail,
} from "@/lib/api";
import { SHIPMENT_STATUSES } from "@/lib/constants";

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

export default function ShipmentDetailClient({ shipmentId }: { shipmentId: number }) {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

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
      const data = await fetchShipment(shipmentId, currentWorkspace.id);
      setShipment(data);
      const carrierList = await fetchCarriers(currentWorkspace.id);
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {shipment.origin_port || "—"} → {shipment.destination_port || "—"}
        </h1>
        <Link href="/dashboard" className="text-sm text-gray-500 underline">
          Back
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500">Customer</p>
          <p>{shipment.customer_name || "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Carrier</p>
          <p>{shipment.carrier_name || "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Mode</p>
          <p>{shipment.freight_mode}</p>
        </div>
        <div>
          <p className="text-gray-500">Cargo</p>
          <p>{shipment.cargo_description || "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Weight</p>
          <p>{shipment.weight_kg != null ? `${shipment.weight_kg} kg` : "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Freight cost</p>
          <p>{shipment.freight_cost != null ? `${shipment.freight_cost.toFixed(2)} ${shipment.currency}` : "—"}</p>
        </div>
        <div>
          <p className="text-gray-500">Shipment date</p>
          <p>{shipment.shipment_date}</p>
        </div>
        <div>
          <p className="text-gray-500">ETA</p>
          <p>{shipment.eta || "—"}</p>
        </div>
        {shipment.document_file_url && (
          <div className="col-span-2">
            <a href={shipment.document_file_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              View source document
            </a>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Status</h2>
        <select
          value={shipment.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={!canEdit}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm capitalize disabled:opacity-50"
        >
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Tracking timeline</h2>
        {shipment.tracking_events.length === 0 ? (
          <p className="text-sm text-gray-500">No tracking events yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {shipment.tracking_events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-b border-gray-100 pb-2">
                <span className="w-24 shrink-0 text-gray-500">{e.event_date}</span>
                <span className="w-24 shrink-0 capitalize">{statusLabel(e.status)}</span>
                <span className="text-gray-500">{e.location || e.note || ""}</span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={eventStatus}
              onChange={(e) => setEventStatus(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm capitalize"
            >
              {SHIPMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <input
              placeholder="Location"
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleAddEvent}
              disabled={savingEvent}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingEvent ? "Adding..." : "Add event"}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Carrier quotes</h2>
        {shipment.quotes.length === 0 ? (
          <p className="text-sm text-gray-500">No quotes yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {shipment.quotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{q.carrier_name}</span>
                <span>
                  {q.amount.toFixed(2)} {q.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={quoteCarrierId}
              onChange={(e) => setQuoteCarrierId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
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
              className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
            <input
              value={quoteCurrency}
              onChange={(e) => setQuoteCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm uppercase"
            />
            <button
              onClick={handleAddQuote}
              disabled={savingQuote || !quoteCarrierId || !quoteAmount}
              className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingQuote ? "Adding..." : "Add quote"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
