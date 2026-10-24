"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import Logo from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

function NavTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-gray-100 text-black" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {children}
    </Link>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const { workspaces, currentWorkspace, selectWorkspace } = useWorkspace();
  const pathname = usePathname();

  if (!user) return null;

  const navItems = [
    { href: "/", label: "Dashboard", requiresWorkspace: true },
    { href: "/dashboard", label: "Shipments", requiresWorkspace: true },
    { href: "/customers", label: "Customers", requiresWorkspace: true },
    { href: "/market-data", label: "Market Data", requiresWorkspace: false },
  ];

  return (
    <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" aria-label="SnapLedger home">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map(
            (item) =>
              (!item.requiresWorkspace || currentWorkspace) && (
                <NavTab key={item.href} href={item.href} active={pathname === item.href}>
                  {item.label}
                </NavTab>
              )
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {currentWorkspace && (
          <select
            value={currentWorkspace.id}
            onChange={(e) => selectWorkspace(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700"
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
            href={`/workspaces/${currentWorkspace.id}/members`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === `/workspaces/${currentWorkspace.id}/members`
                ? "bg-gray-100 text-black"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            Team
          </Link>
        )}
        <div className="mx-1 h-5 w-px bg-gray-200" aria-hidden="true" />
        <span className="hidden text-sm text-gray-500 sm:inline">{user.name || user.email}</span>
        <Button variant="secondary" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
