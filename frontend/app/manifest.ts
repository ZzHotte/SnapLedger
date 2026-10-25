import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shiplog - Freight Forwarding CRM",
    short_name: "Shiplog",
    description:
      "Snap a shipping document, get it auto-logged. Track shipments, quotes, and customers, shared with up to 5 teammates.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
