/**
 * Server-only BFF endpoint: returns WebSocket URL and auth token.
 * The token never appears in the client bundle — only in this server
 * response that is fetched on demand.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8787";
  const token = process.env.DASHBOARD_API_TOKEN ?? "";

  // Derive ws URL: http -> ws, https -> wss
  let wsUrl = backendUrl
    .replace(/^http:\/\//, "ws://")
    .replace(/^https:\/\//, "wss://");

  // Match the page's hostname when we're on localhost-style addresses.
  // Browsers treat `localhost` and `127.0.0.1` as different origins for some
  // security checks; if BACKEND_URL is one and the page is loaded as the
  // other, the WebSocket open can fail with a generic 'WebSocket error'.
  // Force the WS host to mirror the request's hostname so the page and the
  // socket always agree. We only rewrite for loopback names — never for real
  // domains.
  try {
    const reqUrl = new URL(request.url);
    const reqHost = reqUrl.hostname;
    const wsParsed = new URL(wsUrl);
    const wsHost = wsParsed.hostname;
    const isLoopback = (h: string) =>
      h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    if (isLoopback(reqHost) && isLoopback(wsHost) && reqHost !== wsHost) {
      wsParsed.hostname = reqHost;
      wsUrl = wsParsed.toString().replace(/\/$/, "");
    }
  } catch {
    // If URL parsing fails for any reason, fall back to the env-derived value.
  }

  return NextResponse.json({ wsUrl, token });
}
