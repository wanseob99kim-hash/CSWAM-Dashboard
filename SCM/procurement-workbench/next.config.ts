import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // vinext applies this limit to every multipart POST, including /api/files uploads.
      // Keep it just above MAX_FILE_BYTES (20 MB) in server/files-service.ts; the API
      // still enforces the per-file limit itself.
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
