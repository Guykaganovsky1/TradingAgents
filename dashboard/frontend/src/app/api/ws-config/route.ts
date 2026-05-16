/**
 * Server-only BFF endpoint: returns WebSocket URL and auth token.
 * The token never appears in the client bundle — only in this server
 * response that is fetched on demand.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8787";
  const token = process.env.DASHBOARD_API_TOKEN ?? "";

  // Derive ws URL: http -> ws, https -> wss
  const wsUrl = backendUrl.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");

  return NextResponse.json({ wsUrl, token });
}
