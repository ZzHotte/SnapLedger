"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ApiError, fetchCustomer, fetchShipments, type Customer, type Shipment } from "@/lib/api";
import { avatarTone, initials } from "@/lib/avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge, { type BadgeTone } from "@/components/ui/Badge";

const STATUS_TONE: Record<string, BadgeTone> = {
  inquiry: "gray",
  quoted: "blue",
  booked: "indigo",
  in_transit: "amber",
  arrived: "purple",
  customs: "purple",
  delivered: "green",
  cancelled: "red",
};

function statusLabel(status: string): string {
  return status.replace("_", " ");
}

export default function CustomerDetailClient({ customerId }: { customerId: number }) {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      // Independent requests — the shipment list doesn't need the customer
      // record, and vice versa — so run them together.
      const [customerData, shipmentData] = await Promise.all([
        fetchCustomer(customerId, currentWorkspace.id),
        fetchShipments(currentWorkspace.id, 50, 0, { customerId, sortBy: "shipment_date", sortDir: "desc" }),
      ]);
      setCustomer(customerData);
      setShipments(shipmentData.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace, customerId]);

  if (authLoading || !user || loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (error && !customer) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/customers" className="text-sm text-gray-500 underline">
          Back to customers
        </Link>
      </main>
    );
  }

  if (!customer) return null;

  const contactFields = [
    { label: "Contact name", value: customer.contact_name },
    { label: "Email", value: customer.contact_email },
    { label: "Phone", value: customer.contact_phone },
  ];

  return (
    <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 p-6">
      <div>
        <Link href="/customers" className="text-sm text-gray-500 hover:text-gray-900">
          ← Customers
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarTone(customer.name)}`}>
            {initials(customer.name)}
          </span>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
          </CardHeader>
          <dl className="flex flex-col gap-4">
            {contactFields.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shipments</CardTitle>
          </CardHeader>
          {shipments.length === 0 ? (
            <p className="text-sm text-gray-500">No shipments for this customer yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {shipments.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/shipments/${s.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-gray-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-gray-500">{s.ref}</span>
                      <span className="block truncate">
                        {s.origin_port || "—"} → {s.destination_port || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gray-500">{s.shipment_date}</span>
                    <Badge tone={STATUS_TONE[s.status] ?? "gray"}>{statusLabel(s.status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
