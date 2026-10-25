"use client";

import { useEffect, useRef, useState } from "react";

interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
  meta?: string;
}

interface DropdownProps<T extends string | number> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  "aria-label"?: string;
}

// A pill trigger + floating card menu, closes on outside click or Escape.
// Used where a native <select> can't show the open-menu styling (selected-row
// highlight, floating card) the design calls for.
export default function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
}: DropdownProps<T>) {
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

  const current = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white py-1 pr-2.5 pl-3 text-[13px] font-medium text-gray-900 transition-colors hover:border-gray-400"
      >
        {current?.label}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 z-20 mt-2 w-56 origin-top-left rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  selected ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span>{opt.label}</span>
                {opt.meta && <span className="text-xs text-gray-400 capitalize">{opt.meta}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
