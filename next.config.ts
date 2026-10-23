import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Phone photos can be ~20 MB.
    serverActions: { bodySizeLimit: "25mb" },
  },
  images: {
    // Painting and About photos are stored in Vercel Blob.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
