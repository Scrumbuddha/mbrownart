import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Photos go from the browser straight to Blob (src/app/api/studio/upload), so server actions
  // keep Next's default 1 MB body limit.
  images: {
    // Painting and About photos are stored in Vercel Blob.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
