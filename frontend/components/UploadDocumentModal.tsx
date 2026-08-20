"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Image from "next/image";
import {
  ApiError,
  confirmDocument,
  fetchCarriers,
  fetchCustomers,
  uploadDocument,
  type Carrier,
  type Customer,
  type Document as DocumentModel,
} from "@/lib/api";
import { FREIGHT_MODES } from "@/lib/constants";
import { useWorkspace } from "@/lib/workspace-context";

type Step = "idle" | "uploading" | "review" | "saving";

export default function UploadDocumentModal({ onSaved }: { onSaved: () => void }) {
  const { currentWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [doc, setDoc] = useState<DocumentModel | null>(null);
  const [isImage, setIsImage] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);

  const [customerId, setCustomerId] = useState<string>("");
  const [carrierId, setCarrierId] = useState<string>("");
  const [freightMode, setFreightMode] = useState<string>(FREIGHT_MODES[0]);
  const [originPort, setOriginPort] = useState("");
  const [destinationPort, setDestinationPort] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [freightCost, setFreightCost] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [shipmentDate, setShipmentDate] = useState("");

  useEffect(() => {
    if (!open || !currentWorkspace) return;
    fetchCustomers(currentWorkspace.id).then(setCustomers).catch(() => setCustomers([]));
    fetchCarriers(currentWorkspace.id).then(setCarriers).catch(() => setCarriers([]));
  }, [open, currentWorkspace]);

  function closeModal() {
    setOpen(false);
    setStep("idle");
    setDoc(null);
    setError(null);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentWorkspace) return;

    setError(null);
    setStep("uploading");
    setIsImage(file.type.startsWith("image/"));
    try {
      const result = await uploadDocument(file, currentWorkspace.id);
      setDoc(result);
      setOriginPort(result.origin_port ?? "");
      setDestinationPort(result.destination_port ?? "");
      setCargoDescription(result.cargo_description ?? "");
      setWeightKg(result.weight_kg != null ? String(result.weight_kg) : "");
      setShipmentDate(new Date().toISOString().slice(0, 10));
      setStep("review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
      setStep("idle");
    }
  }

  async function handleConfirm() {
    if (!doc || !currentWorkspace || !customerId) return;
    setError(null);
    setStep("saving");
    try {
      await confirmDocument(
        doc.id,
        {
          customer_id: Number(customerId),
          carrier_id: carrierId ? Number(carrierId) : null,
          freight_mode: freightMode,
          origin_port: originPort || null,
          destination_port: destinationPort || null,
          cargo_description: cargoDescription || null,
          weight_kg: weightKg ? parseFloat(weightKg) : null,
          freight_cost: freightCost ? parseFloat(freightCost) : null,
          currency: currency.toUpperCase(),
          shipment_date: shipmentDate,
        },
        currentWorkspace.id
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
        Upload Document
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Upload Shipping Document</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                ✕
              </button>
            </div>

            {step === "idle" && (
              <div>
                <label
                  htmlFor="document-file-input"
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
                  <span className="text-sm font-medium text-gray-700">Click to upload a bill of lading or invoice</span>
                  <span className="text-xs text-gray-400">or take a photo · PNG, JPG, PDF</span>
                  <input
                    id="document-file-input"
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </div>
            )}

            {step === "uploading" && (
              <p className="py-8 text-center text-sm text-gray-500">Reading document…</p>
            )}

            {(step === "review" || step === "saving") && doc && (
              <div className="space-y-4">
                {isImage ? (
                  <div className="relative h-48 w-full overflow-hidden rounded-md border border-gray-200">
                    <Image src={doc.file_url} alt="Shipping document" fill className="object-contain" />
                  </div>
                ) : (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    View uploaded PDF
                  </a>
                )}

                <p className="text-xs text-gray-500">
                  Double check these against the document above before saving.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 text-sm">
                    Customer
                    <select
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select a customer…</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2 text-sm">
                    Carrier (optional)
                    <select
                      value={carrierId}
                      onChange={(e) => setCarrierId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Not yet assigned</option>
                      {carriers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.mode})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Origin port
                    <input
                      value={originPort}
                      onChange={(e) => setOriginPort(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Destination port
                    <input
                      value={destinationPort}
                      onChange={(e) => setDestinationPort(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="col-span-2 text-sm">
                    Cargo description
                    <input
                      value={cargoDescription}
                      onChange={(e) => setCargoDescription(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Freight mode
                    <select
                      value={freightMode}
                      onChange={(e) => setFreightMode(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    >
                      {FREIGHT_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Weight (kg)
                    <input
                      type="number"
                      step="0.01"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Shipment date
                    <input
                      type="date"
                      value={shipmentDate}
                      onChange={(e) => setShipmentDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm">
                    Freight cost
                    <input
                      type="number"
                      step="0.01"
                      value={freightCost}
                      onChange={(e) => setFreightCost(e.target.value)}
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
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <button
                  onClick={handleConfirm}
                  disabled={step === "saving" || !customerId || !shipmentDate}
                  className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {step === "saving" ? "Saving..." : "Confirm & Create Shipment"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
