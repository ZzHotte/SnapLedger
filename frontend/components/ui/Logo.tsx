// Cargo ship + wave mark in a solid tile — the filled-badge-plus-wordmark
// pattern most modern SaaS logos use (Linear, Vercel, …), so it reads as a
// brand mark instead of a loose icon-plus-text pairing. Straight-line-only
// path commands (no Q/C curves) so the same markup renders identically here
// (native SVG) and in app/icon.tsx / app/apple-icon.tsx — Satori (the
// renderer behind next/og's ImageResponse) doesn't interpolate curves, it
// just connects the control points, turning a curve into a jagged zigzag.
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-black"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.64} height={size * 0.64} fill="none" aria-hidden="true">
        <path d="M12 6 L12 14" stroke="white" strokeWidth={1.6} strokeLinecap="round" />
        <path d="M12.3 7 L17 8.8 L12.3 10.6 Z" fill="white" />
        <path d="M4 14 L7 17 L17 17 L20 14" stroke="white" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M2 20 L6 19 L10 20 L14 19 L18 20 L22 19"
          stroke="white"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight text-black">Shiplog</span>
    </span>
  );
}
