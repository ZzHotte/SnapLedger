"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLedger } from "@/lib/ledger-context";
import {
  ApiError,
  createInvite,
  fetchLedgerMembers,
  removeMember,
  updateMemberRole,
  type LedgerMember,
} from "@/lib/api";

const MAX_MEMBERS = 5;

export default function MembersPageClient({ ledgerId }: { ledgerId: number }) {
  const { user } = useAuth();
  const { refresh: refreshLedgers } = useLedger();
  const router = useRouter();

  const [members, setMembers] = useState<LedgerMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await fetchLedgerMembers(ledgerId);
      setMembers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load members");
    }
  }

  useEffect(() => {
    // load is also called from action handlers below to re-sync after a mutation,
    // so it's defined outside this effect — same false positive as ledger-context.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerId]);

  const me = members?.find((m) => m.user_id === user?.id) ?? null;
  const isOwner = me?.role === "owner";

  async function handleInvite() {
    setBusy(true);
    setError(null);
    try {
      const invite = await createInvite(ledgerId, inviteRole);
      setInviteLink(`${window.location.origin}/invites/${invite.invite_code}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create invite");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(userId: number, role: "editor" | "viewer") {
    setError(null);
    try {
      await updateMemberRole(ledgerId, userId, role);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role");
    }
  }

  async function handleRemove(userId: number) {
    setError(null);
    try {
      await removeMember(ledgerId, userId);
      if (userId === user?.id) {
        await refreshLedgers();
        router.push("/");
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ledger members</h1>
        <Link href="/" className="text-sm text-gray-500 underline">
          Back
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {members === null && !error && <p className="text-sm text-gray-500">Loading…</p>}

      {members && (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{m.name || m.email}</p>
                <p className="text-gray-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {isOwner && m.role !== "owner" ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.user_id, e.target.value as "editor" | "viewer")}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                ) : (
                  <span className="text-gray-500">{m.role}</span>
                )}
                {m.role !== "owner" && (isOwner || m.user_id === user?.id) && (
                  <button onClick={() => handleRemove(m.user_id)} className="text-red-600 hover:underline">
                    {m.user_id === user?.id ? "Leave" : "Remove"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOwner && members && (
        <div className="space-y-3 rounded-md border border-gray-200 p-4">
          <h2 className="text-sm font-medium">Invite someone</h2>
          {members.length >= MAX_MEMBERS ? (
            <p className="text-sm text-gray-500">This ledger has reached the {MAX_MEMBERS}-member limit.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">View only</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={busy}
                  className="rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Generate invite link
                </button>
              </div>
              {inviteLink && (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-xs hover:bg-gray-50"
                  >
                    Copy
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </main>
  );
}
