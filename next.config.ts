import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone photos can be ~20 MB.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
