"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ApiError, fetchTransactions, type Transaction } from "@/lib/api";
import { useLedger } from "@/lib/ledger-context";

const PAGE_SIZE = 50;

export default function TransactionsTable({ refreshKey }: { refreshKey: number }) {
  const { currentLedger } = useLedger();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Switching ledgers or adding a transaction invalidates whatever page we were
  // on — jump back to the first page rather than showing a now-meaningless offset.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [currentLedger?.id, refreshKey]);

  useEffect(() => {
    if (!currentLedger) return;
    const ledgerId = currentLedger.id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTransactions(ledgerId, PAGE_SIZE, page * PAGE_SIZE);
        if (!cancelled) {
          setTransactions(data.items);
          setTotal(data.total);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load transactions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, currentLedger, page]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading transactions…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (total === 0) {
    return <p className="text-sm text-gray-500">No transactions yet — upload a receipt to get started.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 pr-4 font-medium">Receipt</th>
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Merchant</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  {t.receipt_image_url && (
                    <a href={t.receipt_image_url} target="_blank" rel="noopener noreferrer">
                      <div className="relative h-12 w-12 overflow-hidden rounded-md border border-gray-200">
                        <Image
                          src={t.receipt_image_url}
                          alt="Receipt thumbnail"
                          fill
                          className="object-cover"
                        />
                      </div>
                    </a>
                  )}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">{t.transaction_date}</td>
                <td className="py-2 pr-4">{t.merchant || "—"}</td>
                <td className="py-2 pr-4">{t.category || "—"}</td>
                <td className="py-2 pr-4 text-right whitespace-nowrap">
                  {t.amount.toFixed(2)} {t.currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>{total} transactions</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page + 1 >= totalPages}
            className="rounded-md border border-gray-300 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
