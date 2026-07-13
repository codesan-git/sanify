// ws.ts — WebSocket reaktif: data sebagai signal, auto-reconnect, cleanup otomatis.
// Cocok untuk real-time dashboard, live alert, streaming data (EWS, monitoring).

import { signal, onCleanup, type Getter } from "../reactivity/signal.ts";

export type WSStatus = "connecting" | "open" | "closed" | "reconnecting";

export interface WSConnection<T = unknown> {
  /** Data terakhir yang diterima, di-parse dari JSON. `null` sebelum pesan pertama. */
  data: Getter<T | null>;
  /** Status koneksi saat ini. */
  status: Getter<WSStatus>;
  /** Error terakhir (koneksi gagal, close abnormal, dll). null saat connected. */
  error: Getter<unknown>;
  /** Kirim pesan (objek di-JSON.stringify otomatis). No-op bila socket belum open. */
  send: (msg: unknown) => void;
  /** Tutup koneksi permanen (tidak reconnect). */
  close: () => void;
}

export interface WSOptions {
  /** Delay sebelum reconnect (ms). Default: 3000. */
  reconnectDelay?: number;
  /** Maksimal percobaan reconnect. Default: Infinity. */
  maxRetries?: number;
  /** Protokol WebSocket (opsional). */
  protocols?: string | string[];
  /** Dipanggil saat koneksi terbuka. */
  onOpen?: (event: Event) => void;
  /** Dipanggil saat koneksi tertutup. */
  onClose?: (event: CloseEvent) => void;
}

/**
 * Buat koneksi WebSocket reaktif. Data masuk otomatis di-parse sebagai JSON
 * dan disimpan ke signal `data`. Auto-reconnect dengan backoff sederhana.
 * Bersihkan otomatis saat owner scope di-dispose (component unmount).
 *
 *   const ws = createWS("ws://localhost:8080/events");
 *   // Di template: ${() => JSON.stringify(ws.data())}
 *   // Kirim: ws.send({ type: "subscribe", camera: "entrance" })
 */
export function createWS<T = unknown>(
  url: string,
  options: WSOptions = {},
): WSConnection<T> {
  const [data, setData] = signal<T | null>(null);
  const [status, setStatus] = signal<WSStatus>("connecting");
  const [error, setError] = signal<unknown>(null);

  const reconnectDelay = options.reconnectDelay ?? 3000;
  const maxRetries = options.maxRetries ?? Infinity;

  let ws: WebSocket | null = null;
  let retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedPermanently = false;

  function connect(): void {
    if (closedPermanently) return;

    try {
      ws = new WebSocket(url, options.protocols);
    } catch {
      // Lingkungan non-browser atau URL invalid — jangan crash.
      setStatus("closed");
      return;
    }

    ws.onopen = (e) => {
      retries = 0;
      setError(null);
      setStatus("open");
      options.onOpen?.(e);
    };

    ws.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data) as T);
      } catch {
        setData(e.data as unknown as T);
      }
    };

    ws.onclose = (e) => {
      options.onClose?.(e);
      if (closedPermanently) {
        setStatus("closed");
        return;
      }
      if (!e.wasClean) setError(new Error(`WebSocket closed abnormally (code ${e.code})`));
      if (retries < maxRetries) {
        retries++;
        setStatus("reconnecting");
        reconnectTimer = setTimeout(connect, reconnectDelay);
      } else {
        setError(new Error(`WebSocket failed after ${maxRetries} retries`));
        setStatus("closed");
      }
    };

    ws.onerror = () => {
      setError(new Error("WebSocket connection error"));
    };
  }

  connect();

  onCleanup(() => {
    closedPermanently = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  });

  return {
    data,
    status,
    error,
    send: (msg: unknown) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    },
    close: () => {
      closedPermanently = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}
