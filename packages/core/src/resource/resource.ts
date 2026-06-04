// resource.ts — fetching reaktif: cache + dedupe lintas-pemanggil, AbortController
// otomatis (cancel in-flight saat key berubah / scope dispose), per-key version
// signal supaya cross-resource update reaktif, integrasi Suspense, dan dua
// strategi penyegaran opt-in (staleTime, refreshOnFocus).

import { signal, effect, useSuspense, onCleanup, type Getter } from "../reactivity/signal.ts";

export interface Resource<T> {
  data: Getter<T | undefined>;
  loading: Getter<boolean>;
  error: Getter<unknown>;
  refetch: () => void;
}

type KeyOption = string | number | (() => string | number | undefined);

// Fetcher boleh menerima AbortSignal (untuk diteruskan ke fetch). Yang lama —
// tanpa parameter — tetap dipanggil dengan signal, hanya diabaikan oleh user.
type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

export interface ResourceOptions<T> {
  // Bila diset, resource mempublikasi/membaca cache global per-key:
  // - dua resource() dengan key sama yang berjalan bersamaan akan berbagi
  //   satu Promise (dedupe in-flight);
  // - resource() ke key yang sudah pernah resolve langsung memakai cache;
  // - key bisa berupa getter → perubahan nilai memicu re-fetch.
  key?: KeyOption;
  // Nilai awal sebelum fetch pertama selesai (dan saat key() === undefined).
  initial?: T;
  // Berapa lama (ms) entry cache dianggap fresh. Cache hit ke entry yang sudah
  // lebih tua dari ini tetap mengembalikan data lama (UI tidak berkedip), TAPI
  // memicu refetch latar yang akan meng-update data saat selesai.
  // Default: tidak pernah stale (cache hidup sampai invalidate()).
  staleTime?: number;
  // Pasang listener `focus` di window; saat tab kembali fokus, refetch (force).
  // Tidak dipasang di lingkungan tanpa window.
  refreshOnFocus?: boolean;
  // Garbage collection: setelah TIDAK ADA subscriber selama ms ini, entry
  // cache + version signal-nya dievict. Mencegah cache bengkak di app yang
  // jalan lama (search, paginated list, dst). Default: Infinity (tidak GC).
  gcTime?: number;
}

interface CacheEntry {
  data?: unknown;
  promise?: Promise<unknown>;
  // ms epoch saat data terakhir di-tulis. Hanya relevan saat staleTime dipakai.
  timestamp?: number;
}

const cache = new Map<string, CacheEntry>();

// Per-key version signal: di-bump tiap cache write (subscribe, setResourceData,
// invalidate). Resource lain yang membaca key sama subscribe ke version-nya,
// jadi update lintas-resource bersifat reaktif tanpa polling.
const versions = new Map<string, ReturnType<typeof signal<number>>>();

function versionFor(key: string): ReturnType<typeof signal<number>> {
  let v = versions.get(key);
  if (!v) {
    v = signal(0);
    versions.set(key, v);
  }
  return v;
}

function bumpVersion(key: string): void {
  versions.get(key)?.[1]((n) => n + 1);
}

function readKey(opt: KeyOption | undefined): string | undefined {
  const raw = typeof opt === "function" ? opt() : opt;
  return raw === undefined ? undefined : String(raw);
}

// Reference count per key + timer eviksi. Tujuan: cache bertahan selama ada
// konsumen, di-evict setelah `gcTime` ms tanpa konsumen sama sekali.
interface KeyState {
  subscribers: number;
  // ms; Infinity = jangan pernah evict (resource tanpa gcTime opsi).
  gcTime: number;
  gcTimer?: ReturnType<typeof setTimeout>;
}

const keyStates = new Map<string, KeyState>();

function subscribeKey(key: string, gcTime: number | undefined): void {
  let state = keyStates.get(key);
  if (!state) {
    state = { subscribers: 0, gcTime: gcTime ?? Infinity };
    keyStates.set(key, state);
  } else if (gcTime !== undefined) {
    // Resource baru dengan gcTime eksplisit menetapkan gcTime entry; yang
    // tanpa opsi tidak melebarkan/menyempitkan — biarkan apa adanya.
    state.gcTime = gcTime;
  }
  state.subscribers++;
  if (state.gcTimer !== undefined) {
    clearTimeout(state.gcTimer);
    state.gcTimer = undefined;
  }
}

function unsubscribeKey(key: string): void {
  const state = keyStates.get(key);
  if (!state) return;
  state.subscribers--;
  if (state.subscribers > 0) return;
  if (state.gcTime === Infinity) return;
  state.gcTimer = setTimeout(() => {
    cache.delete(key);
    versions.delete(key);
    keyStates.delete(key);
  }, state.gcTime);
}

export function resource<T>(
  fetcher: Fetcher<T>,
  options: ResourceOptions<T> = {},
): Resource<T> {
  const [data, setData] = signal<T | undefined>(options.initial);
  const [loading, setLoading] = signal(false);
  const [error, setError] = signal<unknown>(undefined);

  // Suspense terdekat saat resource dibuat; tiap fetch menambah/mengurangi
  // hitungan pending-nya supaya fallback tampil selama ada yang loading.
  const suspense = useSuspense();
  const hasKey = options.key !== undefined;
  let runId = 0;
  let currentController: AbortController | null = null;
  // Key yang sedang di-subscribe; dipakai untuk migrasi saat key reaktif berubah,
  // dan untuk unsubscribe saat scope dispose.
  let subscribedKey: string | undefined;

  const updateSubscription = (key: string | undefined): void => {
    if (subscribedKey === key) return;
    if (subscribedKey !== undefined) unsubscribeKey(subscribedKey);
    if (key !== undefined) subscribeKey(key, options.gcTime);
    subscribedKey = key;
  };

  // Pasang cleanup global: saat scope sekitar dispose, abort fetch yang masih
  // berjalan + unsubscribe dari key sekarang.
  onCleanup(() => {
    currentController?.abort();
    currentController = null;
    if (subscribedKey !== undefined) {
      unsubscribeKey(subscribedKey);
      subscribedKey = undefined;
    }
  });

  const subscribe = (
    id: number,
    promise: Promise<unknown>,
    key: string | undefined,
  ): void => {
    setLoading(true);
    setError(() => undefined);
    suspense?.increment();
    const settle = (): void => suspense?.decrement();
    promise.then(
      (result) => {
        if (key !== undefined && cache.get(key)?.promise === promise) {
          cache.set(key, { data: result, timestamp: Date.now() });
          bumpVersion(key);
        }
        if (id === runId) {
          setData(() => result as T);
          setLoading(false);
        }
        settle();
      },
      (err) => {
        // AbortError diam-diam — bukan error user, hanya superseded.
        const aborted =
          err instanceof Error && (err.name === "AbortError" || err.name === "DOMException");
        if (!aborted) {
          // Error tidak di-cache: refetch berikutnya akan mencoba lagi.
          if (key !== undefined && cache.get(key)?.promise === promise) {
            cache.delete(key);
          }
          if (id === runId) {
            setError(() => err);
            setLoading(false);
          }
        }
        settle();
      },
    );
  };

  // Refetch latar untuk SWR: tidak mengubah loading() (data lama tetap tampil),
  // hanya menyalip data() saat fetch baru selesai. Error refresh latar disengaja
  // di-swallow supaya UI tidak flip ke error state padahal data lama masih sah.
  const backgroundRefresh = (key: string): void => {
    const existing = cache.get(key);
    if (existing?.promise) return; // sudah ada refresh berjalan
    const id = ++runId;
    const controller = new AbortController();
    currentController = controller;
    const promise = fetcher(controller.signal);
    cache.set(key, { ...existing, promise });
    promise.then(
      (result) => {
        if (cache.get(key)?.promise === promise) {
          cache.set(key, { data: result, timestamp: Date.now() });
          bumpVersion(key);
        }
        if (id === runId) setData(() => result as T);
      },
      () => {
        if (cache.get(key)?.promise === promise) {
          cache.set(key, { data: existing?.data, timestamp: existing?.timestamp });
        }
      },
    );
  };

  const isStale = (entry: CacheEntry | undefined): boolean => {
    if (options.staleTime === undefined) return false;
    if (!entry || entry.data === undefined || entry.timestamp === undefined) return true;
    return Date.now() - entry.timestamp > options.staleTime;
  };

  const load = (force = false): void => {
    const key = readKey(options.key);

    // Subscribe ke version signal supaya cache write dari pemanggil lain
    // (mutation/setResourceData/invalidate) memicu re-run effect.
    if (key !== undefined) versionFor(key)[0]();

    // Update reference count untuk key sekarang (handle perpindahan key reaktif).
    updateSubscription(key);

    // Key di-set tapi getter mengembalikan undefined → matikan: reset ke initial.
    if (hasKey && key === undefined) {
      runId++;
      currentController?.abort();
      currentController = null;
      setData(() => options.initial);
      setLoading(false);
      setError(() => undefined);
      return;
    }

    if (key !== undefined && !force) {
      const entry = cache.get(key);
      if (entry?.data !== undefined) {
        runId++;
        setData(() => entry.data as T);
        setLoading(false);
        setError(() => undefined);
        if (isStale(entry)) backgroundRefresh(key);
        return;
      }
      if (entry?.promise) {
        // Dedupe: ikut Promise yang sudah berjalan untuk key ini.
        subscribe(++runId, entry.promise, key);
        return;
      }
    }

    // Abort fetch sebelumnya sebelum mulai baru (mis. key reaktif berubah cepat).
    currentController?.abort();
    currentController = new AbortController();
    const promise = fetcher(currentController.signal);
    if (key !== undefined) cache.set(key, { promise });
    subscribe(++runId, promise, key);
  };

  effect(() => {
    load();
  });

  // Refresh saat tab kembali fokus. Listener dilepas saat owner sekitar dispose.
  if (options.refreshOnFocus && typeof window !== "undefined") {
    const handler = (): void => load(true);
    window.addEventListener("focus", handler);
    onCleanup(() => window.removeEventListener("focus", handler));
  }

  return { data, loading, error, refetch: () => load(true) };
}

// Hapus entry cache. Tiga bentuk:
//   invalidate()              → bersihkan semua
//   invalidate("user:42")     → hapus exact key (string/number)
//   invalidate(k => k.startsWith("user:"))  → hapus semua yang match
// Memicu version bump → resource yang sedang aktif pada key tersebut re-fetch.
export function invalidate(
  matcher?: string | number | ((key: string) => boolean),
): void {
  if (matcher === undefined) {
    const keys = [...cache.keys()];
    cache.clear();
    for (const k of keys) bumpVersion(k);
    return;
  }
  if (typeof matcher === "function") {
    for (const k of [...cache.keys()]) {
      if (matcher(k)) {
        cache.delete(k);
        bumpVersion(k);
      }
    }
    return;
  }
  const k = String(matcher);
  cache.delete(k);
  bumpVersion(k);
}

// Tulis data ke cache secara manual. Berguna untuk optimistic update setelah
// mutation: tampilkan data baru sinkron, refetch nanti kalau perlu. Resource
// yang membaca key ini akan re-run effect karena version-nya di-bump.
export function setResourceData<T>(
  key: string | number,
  data: T | ((prev: T | undefined) => T),
): void {
  const k = String(key);
  const entry = cache.get(k);
  const next =
    typeof data === "function"
      ? (data as (prev: T | undefined) => T)(entry?.data as T | undefined)
      : data;
  cache.set(k, { data: next, timestamp: Date.now() });
  bumpVersion(k);
}

// Baca cache tanpa membuat resource. Mengembalikan undefined bila tidak ada.
// Tidak reaktif — kalau perlu reaktif, pakai resource() biasa.
export function getResourceData<T>(key: string | number): T | undefined {
  return cache.get(String(key))?.data as T | undefined;
}
