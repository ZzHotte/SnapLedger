"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ApiError, fetchTransactions, type Transaction } from "@/lib/api";

export default function TransactionsTable({ refreshKey }: { refreshKey: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTransactions();
        if (!cancelled) setTransactions(data);
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
  }, [refreshKey]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading transactions…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (transactions.length === 0) {
    return <p className="text-sm text-gray-500">No transactions yet — upload a receipt to get started.</p>;
  }

  return (
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
  );
}
