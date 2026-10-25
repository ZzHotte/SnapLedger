import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same mark as app/icon.tsx, scaled up for the iOS home-screen icon (Apple
// applies its own corner-rounding, so this fills edge-to-edge with no radius).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "black",
        }}
      >
        <svg width={120} height={120} viewBox="0 0 24 24" fill="none">
          <path d="M12 6 L12 14" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
          <path d="M12.3 7 L17 8.8 L12.3 10.6 Z" fill="white" />
          <path d="M4 14 L7 17 L17 17 L20 14" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M2 20 L6 19 L10 20 L14 19 L18 20 L22 19"
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
