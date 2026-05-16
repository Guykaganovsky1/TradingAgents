/**
 * BFF Proxy — forwards all /api/** requests to the FastAPI backend.
 * Injects the bearer token server-side so it's never exposed to the browser.
 *
 * WebSocket upgrades cannot be proxied here — the WS client connects via
 * the backend URL directly (token passed as ?token= query param).
 */
import { type NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? "http://localhost:8787";

const TOKEN = process.env.DASHBOARD_API_TOKEN ?? "";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const pathStr = path.join("/");

  // Reconstruct query string
  const searchParams = request.nextUrl.searchParams.toString();
  const qs = searchParams ? `?${searchParams}` : "";
  const url = `${BACKEND_URL}/api/${pathStr}${qs}`;

  // Forward headers (except host)
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  headers.delete("host");

  let body: BodyInit | null = null;
  const method = request.method;
  if (!["GET", "HEAD"].includes(method)) {
    body = await request.arrayBuffer();
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
      // @ts-expect-error -- Node fetch supports duplex
      duplex: body ? "half" : undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${String(err)}` },
      { status: 503 }
    );
  }

  // Stream response back
  const responseHeaders = new Headers(backendRes.headers);
  responseHeaders.delete("transfer-encoding"); // Let Next.js handle it

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const PUT = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
