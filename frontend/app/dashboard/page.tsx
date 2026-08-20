"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { ApiError, generateMockData } from "@/lib/api";
import { MOCK_DATA_COUNT } from "@/lib/constants";
import UploadDocumentModal from "@/components/UploadDocumentModal";
import ShipmentsTable from "@/components/ShipmentsTable";

export default function ShipmentsPage() {
  const { user, loading } = useAuth();
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const [refreshKey, setRefreshKey] = useState(0);
  const [generatingMockData, setGeneratingMockData] = useState(false);
  const [mockDataError, setMockDataError] = useState<string | null>(null);

  async function handleGenerateMockData() {
    if (!currentWorkspace) return;
    if (
      !window.confirm(
        `Generate ${MOCK_DATA_COUNT.toLocaleString()} mock shipments in this workspace? This requires at least one customer to already exist, and can't be undone from the UI.`
      )
    ) {
      return;
    }
    setGeneratingMockData(true);
    setMockDataError(null);
    try {
      await generateMockData(currentWorkspace.id, MOCK_DATA_COUNT);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setMockDataError(err instanceof ApiError ? err.message : "Failed to generate mock data");
    } finally {
      setGeneratingMockData(false);
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
      <main className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-semibold">SnapLedger Freight CRM</h1>
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
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Welcome, {user.name || user.email}</h1>
        <div className="flex items-center gap-2">
          {currentWorkspace?.role === "owner" && (
            <button
              onClick={handleGenerateMockData}
              disabled={generatingMockData}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {generatingMockData ? "Generating…" : "Generate Mock Data"}
            </button>
          )}
          {currentWorkspace?.role !== "viewer" && (
            <UploadDocumentModal onSaved={() => setRefreshKey((k) => k + 1)} />
          )}
        </div>
      </div>

      {mockDataError && <p className="text-sm text-red-600">{mockDataError}</p>}

      {!workspaceLoading && !currentWorkspace ? (
        <p className="text-sm text-red-600">
          No workspace found for this account. Try refreshing — if this persists, contact support.
        </p>
      ) : (
        <ShipmentsTable refreshKey={refreshKey} />
      )}
    </main>
  );
}
