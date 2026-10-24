// Shipping-container mark in a solid tile — the filled-badge-plus-wordmark
// pattern most modern SaaS logos use (Linear, Vercel, …), so it reads as a
// brand mark instead of a loose icon-plus-text pairing.
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-black"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.64} height={size * 0.64} fill="none" aria-hidden="true">
        <path
          d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"
          stroke="white"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path d="M4 8.5 12 13l8-4.5M12 13v7" stroke="white" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight text-black">SnapLedger</span>
    </span>
  );
}
