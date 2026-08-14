"use client";

import { useState, type ChangeEvent } from "react";
import Image from "next/image";
import { ApiError, confirmReceipt, uploadReceipt, type Receipt } from "@/lib/api";
import { CATEGORIES } from "@/lib/constants";
import { useLedger } from "@/lib/ledger-context";

type Step = "idle" | "uploading" | "review" | "saving";

export default function UploadReceiptModal({ onSaved }: { onSaved: () => void }) {
  const { currentLedger } = useLedger();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [merchant, setMerchant] = useState("");
  const [txDate, setTxDate] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);

  function closeModal() {
    setOpen(false);
    setStep("idle");
    setReceipt(null);
    setError(null);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentLedger) return;

    setError(null);
    setStep("uploading");
    try {
      const result = await uploadReceipt(file, currentLedger.id);
      setReceipt(result);
      setMerchant(result.merchant ?? "");
      setTxDate(result.transaction_date ?? new Date().toISOString().slice(0, 10));
      setAmount(result.amount != null ? String(result.amount) : "");
      setCurrency(result.currency ?? "USD");
      setCategory(
        result.category && (CATEGORIES as readonly string[]).includes(result.category)
          ? result.category
          : "Other"
      );
      setStep("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
      setStep("idle");
    }
  }

  async function handleConfirm() {
    if (!receipt || !currentLedger) return;
    setError(null);
    setStep("saving");
    try {
      await confirmReceipt(
        receipt.id,
        {
          merchant: merchant || null,
          transaction_date: txDate,
          amount: parseFloat(amount),
          currency: currency.toUpperCase(),
          category,
        },
        currentLedger.id
      );
      closeModal();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
      setStep("review");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Upload Receipt
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Upload Receipt</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                ✕
              </button>
            </div>

            {step === "idle" && (
              <div>
                <label
                  htmlFor="receipt-file-input"
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-10 text-center transition-colors hover:border-gray-400 hover:bg-gray-50"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="h-10 w-10 text-gray-400"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75v12"
                    />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">Click to upload a receipt</span>
                  <span className="text-xs text-gray-400">or take a photo · PNG, JPG</span>
                  <input
                    id="receipt-file-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
            )}

            {step === "uploading" && (
              <p className="py-8 text-center text-sm text-gray-500">Reading receipt…</p>
            )}

            {(step === "review" || step === "saving") && receipt && (
              <div className="space-y-4">
                <div className="relative h-48 w-full overflow-hidden rounded-md border border-gray-200">
                  <Image src={receipt.image_url} alt="Receipt" fill className="object-contain" />
                </div>

                <p className="text-xs text-gray-500">
                  Double check these against the photo above before saving.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 text-sm">
                    Merchant
                    <input
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Date
                    <input
                      type="date"
                      value={txDate}
                      onChange={(e) => setTxDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Amount
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Currency
                    <input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                      maxLength={3}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
                    />
                  </label>
                  <label className="text-sm">
                    Category
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  onClick={handleConfirm}
                  disabled={step === "saving" || !amount || !txDate}
                  className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {step === "saving" ? "Saving..." : "Confirm & Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
