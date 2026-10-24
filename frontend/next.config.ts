import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Docker build copy just the traced runtime files (.next/standalone)
  // instead of the full node_modules into the production image.
  output: "standalone",
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
