"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLedger } from "@/lib/ledger-context";
import { acceptInvite, ApiError } from "@/lib/api";

type Step = "idle" | "accepting" | "done";

export default function AcceptInviteClient({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const { refresh, selectLedger } = useLedger();
  const router = useRouter();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ledgerName, setLedgerName] = useState<string | null>(null);

  async function handleAccept() {
    setStep("accepting");
    setError(null);
    try {
      const result = await acceptInvite(code);
      await refresh();
      selectLedger(result.ledger_id);
      setLedgerName(result.ledger_name);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept invite");
      setStep("idle");
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">You&apos;ve been invited to a shared ledger</h1>
        <p className="text-sm text-gray-500">Log in or register, then open this invite link again.</p>
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

  if (step === "done") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">You joined {ledgerName}</h1>
        <button
          onClick={() => router.push("/")}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Go to dashboard
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">You&apos;ve been invited to a shared ledger</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleAccept}
        disabled={step === "accepting"}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {step === "accepting" ? "Joining..." : "Accept invite"}
      </button>
    </main>
  );
}
