"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import UploadReceiptModal from "@/components/UploadReceiptModal";
import TransactionsTable from "@/components/TransactionsTable";

export default function Home() {
  const { user, loading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">SnapLedger</h1>
        <div className="flex gap-3">
          <Link href="/login" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
            Log in
          </Link>
          <Link href="/register" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium">
            Register
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Welcome, {user.name || user.email}</h1>
        <UploadReceiptModal onSaved={() => setRefreshKey((k) => k + 1)} />
      </div>

      <TransactionsTable refreshKey={refreshKey} />
    </main>
  );
}
