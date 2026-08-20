"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ApiError, createCustomer, fetchCustomers, type Customer } from "@/lib/api";

export default function CustomersPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const canEdit = currentWorkspace?.role !== "viewer";

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
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Customers</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {!loading &&
        (customers.length === 0 ? (
          <p className="text-sm text-gray-500">No customers yet — add one below.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {customers.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{c.name}</p>
                <p className="text-gray-500">
                  {[c.contact_name, c.contact_email, c.contact_phone].filter(Boolean).join(" · ") || "No contact details"}
                </p>
              </li>
            ))}
          </ul>
        ))}

      {canEdit && (
        <div className="space-y-3 rounded-md border border-gray-200 p-4">
          <h2 className="text-sm font-medium">Add a customer</h2>
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
          <button
            onClick={handleCreate}
            disabled={saving || !name}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add customer"}
          </button>
        </div>
      )}
    </main>
  );
}
