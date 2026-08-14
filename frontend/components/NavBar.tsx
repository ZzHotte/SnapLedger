"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLedger } from "@/lib/ledger-context";

export default function NavBar() {
  const { user, logout } = useAuth();
  const { ledgers, currentLedger, selectLedger } = useLedger();

  if (!user) return null;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.png" alt="SnapLedger" width={28} height={28} priority />
        <span className="text-sm font-semibold">SnapLedger</span>
      </Link>

      <div className="flex items-center gap-4">
        {currentLedger && (
          <select
            value={currentLedger.id}
            onChange={(e) => selectLedger(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            aria-label="Switch ledger"
          >
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.role !== "owner" ? ` (${l.role})` : ""}
              </option>
            ))}
          </select>
        )}
        {currentLedger && (
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Dashboard
          </Link>
        )}
        <Link
          href="/market-data"
          className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
        >
          Market Data
        </Link>
        {currentLedger && (
          <Link
            href={`/ledgers/${currentLedger.id}/members`}
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Members
          </Link>
        )}
        <span className="text-sm text-gray-500">{user.name || user.email}</span>
        <button
          onClick={logout}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Log out
        </button>
      </div>
    </header>
  );
}
