import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Scope file tracing to the frontend directory ONLY.
  //
  // WHY: previously set to "../../" which is `.claude/worktrees/` —
  // Turbopack then watched every sibling worktree + ruflo's `.swarm/`
  // HNSW binary index. On each HMR cycle the PostCSS worker pool
  // fork-bombed into the thousands (3990+ processes observed and
  // shut the machine down). Scoping the trace root to this dir
  // contains the watcher.
  outputFileTracingRoot: __dirname,

  // Bound Turbopack to this directory only — belt + suspenders.
  turbopack: {
    root: __dirname,
  },

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
