"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";

export default function NavBar() {
  const { user, logout } = useAuth();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();

  if (!user) return null;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.png" alt="SnapLedger" width={28} height={28} priority />
        <span className="text-sm font-semibold">SnapLedger CRM</span>
      </Link>

      <div className="flex items-center gap-4">
        {currentWorkspace && (
          <select
            value={currentWorkspace.id}
            onChange={(e) => selectWorkspace(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            aria-label="Switch workspace"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.role !== "owner" ? ` (${w.role})` : ""}
              </option>
            ))}
          </select>
        )}
        {currentWorkspace && (
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Dashboard
          </Link>
        )}
        {currentWorkspace && (
          <Link
            href="/customers"
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Customers
          </Link>
        )}
        <Link
          href="/market-data"
          className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
        >
          Market Data
        </Link>
        {currentWorkspace && (
          <Link
            href={`/workspaces/${currentWorkspace.id}/members`}
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Team
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
