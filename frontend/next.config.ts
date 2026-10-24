import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Docker build copy just the traced runtime files (.next/standalone)
  // instead of the full node_modules into the production image. Vercel's own
  // build pipeline does its own file-tracing/packaging and doesn't produce the
  // artifacts "standalone" mode expects — it fails outright with this set, so
  // skip it under Vercel's build (which always sets VERCEL=1).
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
