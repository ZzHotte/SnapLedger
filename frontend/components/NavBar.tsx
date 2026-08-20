"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";

function ContainerMark() {
  return (
    <svg
      viewBox="0 0 28 28"
      width={22}
      height={22}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="24" height="16" rx="1.5" />
      <path d="M8 6v16M14 6v16M20 6v16" />
      <path d="M2 12h24M2 17h24" />
    </svg>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();

  if (!user) return null;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/" className="flex items-center gap-2">
        <ContainerMark />
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
            href="/"
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Dashboard
          </Link>
        )}
        {currentWorkspace && (
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 underline-offset-2 hover:text-black hover:underline"
          >
            Shipments
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
