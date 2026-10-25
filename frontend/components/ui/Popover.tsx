"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}

// A trigger button + floating card panel, closes on outside click or Escape.
// Shared shell for the table's Filter/View menus — anything beyond a single
// select list (Dropdown already covers that case).
export default function Popover({ label, icon, active = false, panelClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          active
            ? "border-gray-900 bg-gray-900 text-white"
            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        {icon}
        {label}
      </button>

      {open && (
        <div
          className={`absolute right-0 z-20 mt-2 origin-top-right rounded-xl border border-gray-200 bg-white p-2 shadow-lg ${panelClassName ?? "w-60"}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
