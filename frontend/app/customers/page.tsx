"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Reorder, useDragControls } from "motion/react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ApiError, createCustomer, fetchCustomers, reorderCustomers, type Customer } from "@/lib/api";
import { avatarTone, initials } from "@/lib/avatar";
import { Button } from "@/components/ui/Button";

function CustomerCard({ customer, onDragEnd }: { customer: Customer; onDragEnd: () => void }) {
  const dragControls = useDragControls();
  const contactLine = [customer.contact_name, customer.contact_email, customer.contact_phone]
    .filter(Boolean)
    .join(" · ");

  return (
    <Reorder.Item
      value={customer}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileDrag={{ scale: 1.02, boxShadow: "0 10px 24px -8px rgba(0,0,0,0.18)", zIndex: 1 }}
      transition={{ duration: 0.15 }}
      className="group relative flex items-center gap-1 rounded-lg border border-gray-200 bg-white pr-4 select-none hover:bg-gray-50"
    >
      <button
        type="button"
        onPointerDown={(e) => dragControls.start(e)}
        aria-label={`Reorder ${customer.name}`}
        className="shrink-0 cursor-grab touch-none rounded p-1 pl-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.3" />
          <circle cx="11" cy="3" r="1.3" />
          <circle cx="5" cy="8" r="1.3" />
          <circle cx="11" cy="8" r="1.3" />
          <circle cx="5" cy="13" r="1.3" />
          <circle cx="11" cy="13" r="1.3" />
        </svg>
      </button>

      <Link href={`/customers/${customer.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarTone(customer.name)}`}>
          {initials(customer.name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{customer.name}</span>
          <span className="block truncate text-xs text-gray-500">{contactLine || "No contact details"}</span>
        </span>
      </Link>
    </Reorder.Item>
  );
}

export default function CustomersPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const canEdit = currentWorkspace?.role !== "viewer";

  // Reorder.Group's onReorder fires on every swap during a drag, but the
  // order should only be persisted once, when the drag actually ends — so
  // the drag-end handler reads the latest order from this ref rather than
  // from `customers`, which a stale closure could otherwise see mid-drag.
  const customersRef = useRef<Customer[]>([]);
  useEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  async function persistOrder() {
    if (!currentWorkspace) return;
    try {
      await reorderCustomers(
        currentWorkspace.id,
        customersRef.current.map((c) => c.id)
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the new order");
    }
  }

  async function load() {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomers(currentWorkspace.id);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace]);

  async function handleCreate() {
    if (!currentWorkspace || !name) return;
    setSaving(true);
    setError(null);
    try {
      await createCustomer(currentWorkspace.id, {
        name,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
      });
      setName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setShowAddForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  const subtitle = useMemo(() => {
    if (loading || customers.length === 0) return undefined;
    const count = customers.length === 1 ? "1 customer" : `${customers.length} customers`;
    return customers.length > 1 ? `${count} · drag the handle to reorder` : count;
  }, [customers.length, loading]);

  if (authLoading || !user) {
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
          <h1 className="text-xl font-semibold">Customers</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        {canEdit && (
          <Button variant="primary" onClick={() => setShowAddForm(true)}>
            Add customer
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading &&
        (customers.length === 0 ? (
          <p className="text-sm text-gray-500">No customers yet — add one to get started.</p>
        ) : (
          <Reorder.Group axis="y" values={customers} onReorder={setCustomers} className="flex flex-col gap-2">
            {customers.map((c) => (
              <CustomerCard key={c.id} customer={c} onDragEnd={persistOrder} />
            ))}
          </Reorder.Group>
        ))}

      {showAddForm && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add a customer</h2>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Company name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Contact name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Contact phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Contact email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={saving || !name}
              className="mt-4 w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add customer"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
