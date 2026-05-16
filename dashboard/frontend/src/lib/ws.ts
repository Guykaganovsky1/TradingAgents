/**
 * WebSocket client with auto-reconnect + exponential backoff.
 * Used by use-run-stream.ts hook.
 *
 * The full WebSocket URL (including auth token query param) is passed
 * externally — this class has no knowledge of backend topology or secrets.
 */
import type { AnyWsEvent } from "./types";

export type WsStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface WsClientOptions {
  onEvent: (event: AnyWsEvent) => void;
  onStatusChange: (status: WsStatus) => void;
  onError: (error: string) => void;
  maxReconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}

export class RunWsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private destroyed = false;
  private readonly maxDelay: number;
  private readonly maxAttempts: number;

  /**
   * @param wsUrl  Full WebSocket URL, e.g.
   *               ws://localhost:8787/ws/runs/<id>?token=<token>
   *               Constructed by the hook after fetching /api/ws-config.
   */
  constructor(
    private readonly wsUrl: string,
    private readonly options: WsClientOptions
  ) {
    this.maxDelay = options.maxReconnectDelayMs ?? 30_000;
    this.maxAttempts = options.maxReconnectAttempts ?? 15;
    this.connect();
  }

  private connect() {
    if (this.destroyed) return;

    this.options.onStatusChange(
      this.reconnectAttempts === 0 ? "connecting" : "reconnecting"
    );

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.options.onStatusChange("connected");
    };

    this.ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as AnyWsEvent;
        this.options.onEvent(event);
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onerror = () => {
      this.options.onError("WebSocket error");
    };

    this.ws.onclose = (ev) => {
      if (this.destroyed) return;
      if (ev.code === 1000) {
        // Normal close — run finished
        this.options.onStatusChange("disconnected");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= this.maxAttempts) {
      this.options.onStatusChange("disconnected");
      this.options.onError("Max reconnect attempts reached");
      return;
    }

    this.options.onStatusChange("reconnecting");
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxDelay
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close(1000);
    }
  }
}
