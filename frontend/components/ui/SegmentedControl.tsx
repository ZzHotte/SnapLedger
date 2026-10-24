interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  "aria-label"?: string;
}

// A pill-group toggle (e.g. Count/Value) — distinct from Button so a reader
// never mistakes a view-mode switch for an action that submits or navigates.
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-md bg-gray-100 p-0.5 text-sm"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              active ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
