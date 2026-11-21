"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import Logo from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import Dropdown from "@/components/ui/Dropdown";

// Minimal underline tab, not a filled pill — the active tab's 2px bottom
// border sits exactly on the header's own border-b (both rows share the same
// h-12 baseline), so it reads as "this segment of the separator is black"
// rather than a separate box floating above the line.
function NavTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-full items-center border-b-2 px-0.5 text-[13px] font-medium transition-colors ${
        active ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900"
      }`}
    >
      {children}
    </Link>
  );
}

function UtilityLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`text-[13px] font-medium transition-colors ${
        active ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
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
    { href: "/transport", label: "Transport", requiresWorkspace: true },
    { href: "/storage", label: "Storage", requiresWorkspace: true },
    { href: "/market-data", label: "Market Data", requiresWorkspace: false },
  ];

  // Sections with sub-routes (e.g. /transport/driver) keep their tab lit;
  // "/" and "/dashboard" stay exact so they don't swallow every route.
  const isActive = (href: string) =>
    href === "/" || href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const membersHref = currentWorkspace ? `/workspaces/${currentWorkspace.id}/members` : null;

  return (
    <header className="border-b border-gray-200 bg-white px-6">
      {/* The full bar (logo + 6 tabs + workspace switcher + Team + user +
          Log out) doesn't fit a phone-width viewport. Scrolling it
          horizontally within the header keeps every item reachable without
          the overflow pushing the whole page sideways. */}
      <div className="flex h-12 items-center justify-between gap-4 overflow-x-auto">
        <div className="flex h-full shrink-0 items-center gap-7">
          <Link href="/" aria-label="Shiplog home" className="flex items-center">
            <Logo size={20} />
          </Link>

          <nav className="flex h-full items-center gap-5">
            {navItems.map(
              (item) =>
                (!item.requiresWorkspace || currentWorkspace) && (
                  <NavTab key={item.href} href={item.href} active={isActive(item.href)}>
                    {item.label}
                  </NavTab>
                )
            )}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {currentWorkspace && (
            <Dropdown
              value={currentWorkspace.id}
              onChange={selectWorkspace}
              aria-label="Switch workspace"
              options={workspaces.map((w) => ({
                value: w.id,
                label: w.name,
                meta: w.role !== "owner" ? w.role : undefined,
              }))}
            />
          )}
          {membersHref && (
            <UtilityLink href={membersHref} active={pathname === membersHref}>
              Team
            </UtilityLink>
          )}
          <div className="h-4 w-px bg-gray-200" aria-hidden="true" />
          <span className="hidden text-[13px] text-gray-500 sm:inline">{user.name || user.email}</span>
          <Button variant="secondary" size="sm" onClick={logout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
