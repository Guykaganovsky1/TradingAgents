import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",

  // Ensures standalone build produces a portable directory structure
  // by tracing from the monorepo root, not from inside frontend/.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Server-only env vars (not exposed to browser)
  // BACKEND_URL and DASHBOARD_API_TOKEN are used in the BFF proxy
  // They are NOT prefixed with NEXT_PUBLIC_

  images: {
    remotePatterns: [],
  },

  // Allow WebSocket connections to the backend (for dev proxy info)
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
