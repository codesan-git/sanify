// client.ts — fetch wrapper opsional dengan baseUrl + interceptor (before/after).
// Tipis di atas fetch native: cuma menggabung header, merangkai interceptor,
// dan menyediakan shortcut method (get/post/put/patch/delete) yang otomatis
// JSON-encode body. Bukan replacement axios — kalau butuh banyak, pakai
// library khusus.

type HeaderMap = Record<string, string>;

export type RequestInterceptor = (
  init: RequestInit,
  url: string,
) => RequestInit | Promise<RequestInit>;

export type ResponseInterceptor = (
  res: Response,
  req: { url: string; init: RequestInit },
) => unknown | Promise<unknown>;

export interface ClientOptions {
  baseUrl?: string;
  // Header default yang digabung ke tiap request. Bisa fungsi (re-evaluasi
  // tiap request) untuk header yang berubah, mis. token auth dari signal.
  headers?: HeaderMap | (() => HeaderMap);
  // Modifikasi RequestInit sebelum fetch (tambah auth, signature, dll).
  before?: RequestInterceptor;
  // Proses Response sebelum dikembalikan ke caller. Default: lempar Error
  // bila !res.ok, lalu parse JSON / text sesuai Content-Type. Override
  // bila format error backend butuh penanganan khusus.
  after?: ResponseInterceptor;
}

export interface Client {
  request<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  get<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  post<T = unknown>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
  put<T = unknown>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
  patch<T = unknown>(url: string, body?: unknown, init?: RequestInit): Promise<T>;
  delete<T = unknown>(url: string, init?: RequestInit): Promise<T>;
}

// Error default yang dilempar oleh `defaultAfter` untuk respons non-2xx.
// Sengaja punya `status` dan `body` supaya konsumen bisa branch via
// `instanceof HttpError`.
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
  }
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

async function defaultAfter(res: Response): Promise<unknown> {
  const body = await parseBody(res).catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : undefined);
    throw new HttpError(res.status, body, message);
  }
  return body;
}

export function createClient(opts: ClientOptions = {}): Client {
  const resolveHeaders = (): HeaderMap =>
    typeof opts.headers === "function" ? opts.headers() : opts.headers ?? {};

  const request = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
    const fullUrl = opts.baseUrl ? joinUrl(opts.baseUrl, url) : url;
    const merged: RequestInit = {
      ...init,
      headers: {
        ...resolveHeaders(),
        ...((init.headers as HeaderMap | undefined) ?? {}),
      },
    };
    const finalInit = opts.before ? await opts.before(merged, fullUrl) : merged;
    const res = await fetch(fullUrl, finalInit);
    const after = opts.after ?? defaultAfter;
    return (await after(res, { url: fullUrl, init: finalInit })) as T;
  };

  // Helper untuk method yang mengirim body JSON. Body !== undefined → di-encode
  // ke JSON dan Content-Type otomatis diset (boleh di-override lewat init).
  const withJsonBody = (method: string) =>
    <T = unknown>(url: string, body?: unknown, init?: RequestInit): Promise<T> => {
      const hasBody = body !== undefined;
      return request<T>(url, {
        ...init,
        method,
        body: hasBody ? JSON.stringify(body) : init?.body,
        headers: hasBody
          ? {
              "Content-Type": "application/json",
              ...((init?.headers as HeaderMap | undefined) ?? {}),
            }
          : (init?.headers as HeaderMap | undefined),
      });
    };

  return {
    request,
    get: <T = unknown>(url: string, init?: RequestInit) =>
      request<T>(url, { ...init, method: "GET" }),
    post: withJsonBody("POST"),
    put: withJsonBody("PUT"),
    patch: withJsonBody("PATCH"),
    delete: <T = unknown>(url: string, init?: RequestInit) =>
      request<T>(url, { ...init, method: "DELETE" }),
  };
}
