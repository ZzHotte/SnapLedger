"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function NavBar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.png" alt="SnapLedger" width={28} height={28} priority />
        <span className="text-sm font-semibold">SnapLedger</span>
      </Link>

      <div className="flex items-center gap-4">
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
