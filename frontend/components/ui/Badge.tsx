import { type ReactNode } from "react";

export type BadgeTone = "gray" | "blue" | "indigo" | "amber" | "green" | "purple" | "red";

// Same hue steps as ShipmentsTable's status pills, so a "Delivered" badge on
// the Transport page reads exactly like one in the shipments table.
const TONES: Record<BadgeTone, string> = {
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-green-50 text-green-700",
  purple: "bg-purple-50 text-purple-700",
  red: "bg-red-50 text-red-700",
};

export default function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

// Marks a page whose numbers are placeholders until its backend lands, so
// sample rows are never mistaken for the workspace's real data.
export function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
      <span className="font-semibold">Preview</span> · {children}
    </div>
  );
}
