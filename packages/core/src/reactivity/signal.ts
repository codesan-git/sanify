// signal.ts — inti reactivity fine-grained (gaya Solid)

export type Getter<T> = () => T;
export type Setter<T> = (next: T | ((prev: T) => T)) => void;
type CleanupFn = () => void;

let currentObserver: Effect | null = null;
let currentOwner: Owner | null = null;

// ── Devtools (opt-in) ───────────────────────────────────────
// Tracking owner-tree dimatikan secara default; biaya runtime cuma muncul
// setelah __debug.enable() dipanggil (mis. di dev console).
let debugEnabled = false;
let signalsCreated = 0;
let effectsCreated = 0;
const rootOwners = new Set<Owner>();

// ── Batching ────────────────────────────────────────────────
let batchDepth = 0;
const pendingEffects = new Set<Effect>();
let flushScheduled = false;

function flush(): void {
  flushScheduled = false;
  // Drain sampai stabil: effect yang dijadwalkan SELAMA flush (mis. set sinyal
  // di dalam effect lain) ikut diproses dalam flush yang sama, bukan tick berikut.
  while (pendingEffects.size) {
    const effects = [...pendingEffects];
    pendingEffects.clear();
    for (const e of effects) e.run();
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

function schedule(effect: Effect): void {
  pendingEffects.add(effect);
  if (batchDepth === 0 && !flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => {
      if (batchDepth === 0) flush();
    });
  }
}

// ── Signal ──────────────────────────────────────────────────
export function signal<T>(initial: T): [Getter<T>, Setter<T>] {
  if (debugEnabled) signalsCreated++;
  let value = initial;
  const subscribers = new Set<Effect>();

  const get: Getter<T> = () => {
    if (currentObserver) {
      subscribers.add(currentObserver);
      currentObserver.deps.add(subscribers);
    }
    return value;
  };

  const set: Setter<T> = (next) => {
    const newValue =
      typeof next === "function" ? (next as (p: T) => T)(value) : next;
    if (Object.is(newValue, value)) return;
    value = newValue;
    for (const sub of [...subscribers]) schedule(sub);
  };

  return [get, set];
}

// ── Effect ──────────────────────────────────────────────────
class Effect {
  deps = new Set<Set<Effect>>();
  owner = currentOwner; // untuk merutekan error ke ErrorBoundary terdekat
  private cleanups: CleanupFn[] = [];
  private disposed = false;

  constructor(private fn: () => void | CleanupFn) {
    if (debugEnabled) effectsCreated++;
    this.run();
  }

  addCleanup(fn: CleanupFn): void {
    this.cleanups.push(fn);
  }

  run(): void {
    if (this.disposed) return;
    this.dispose(false);
    const prevObs = currentObserver;
    currentObserver = this;
    try {
      const result = this.fn();
      if (typeof result === "function") this.cleanups.push(result);
    } catch (err) {
      const handler = findErrorHandler(this.owner);
      if (handler) handler(err);
      else throw err;
    } finally {
      currentObserver = prevObs;
    }
  }

  dispose(permanent = true): void {
    // Isolasi tiap cleanup: throw di salah satu TIDAK boleh menggagalkan
    // sisanya (kalau ya, listener/timer berikutnya tidak ter-cleanup =
    // memory leak). Routing ke ErrorBoundary dihindari di sini supaya tidak
    // re-entrant saat kita sedang membongkar; cukup log via console.error.
    for (const c of this.cleanups) {
      try {
        c();
      } catch (err) {
        console.error("sanify: effect cleanup threw, continuing chain", err);
      }
    }
    this.cleanups = [];
    for (const dep of this.deps) dep.delete(this);
    this.deps.clear();
    if (permanent) this.disposed = true;
  }
}

export function effect(fn: () => void | CleanupFn): () => void {
  const e = new Effect(fn);
  const dispose = () => e.dispose(true);
  if (currentOwner) currentOwner.add(dispose);
  return dispose;
}

// Baca signal di dalam fn TANPA berlangganan (effect tak akan re-run karenanya).
export function untrack<T>(fn: () => T): T {
  const prev = currentObserver;
  currentObserver = null;
  try {
    return fn();
  } finally {
    currentObserver = prev;
  }
}

// Daftarkan cleanup pada scope reaktif aktif: effect (jalan sebelum run ulang &
// saat dispose) bila ada, jika tidak ke owner aktif (jalan saat owner dispose).
export function onCleanup(fn: CleanupFn): void {
  if (currentObserver) currentObserver.addCleanup(fn);
  else if (currentOwner) currentOwner.add(fn);
}

// Jalan sekali setelah mount (microtask berikutnya). Dilewati bila owner aktif
// keburu di-dispose sebelum sempat jalan. Throw di-route ke ErrorBoundary
// terdekat lewat rantai owner — konsisten dengan effect().
export function onMount(fn: () => void): void {
  const owner = currentOwner;
  queueMicrotask(() => {
    if (owner?.disposed) return;
    try {
      fn();
    } catch (err) {
      const handler = findErrorHandler(owner);
      if (handler) handler(err);
      else throw err;
    }
  });
}

// Dependency eksplisit untuk effect/computed: hanya `deps` yang dilacak; `fn`
// jalan untracked dan menerima nilai sekarang + sebelumnya. `defer` melewati
// eksekusi pertama (tunggu perubahan).
export function on<D, R>(
  deps: () => D,
  fn: (value: D, prev: D | undefined) => R,
  options: { defer?: boolean } = {},
): () => R | undefined {
  let prev: D | undefined;
  let deferred = options.defer ?? false;
  return () => {
    const value = deps();
    return untrack(() => {
      if (deferred) {
        deferred = false;
        prev = value;
        return undefined;
      }
      const result = fn(value, prev);
      prev = value;
      return result;
    });
  };
}

// ── Computed ────────────────────────────────────────────────
export function computed<T>(fn: () => T): Getter<T> {
  const [get, set] = signal<T>(undefined as T);
  effect(() => set(() => fn()));
  return get;
}

// ── Owner / Scope ───────────────────────────────────────────
export class Owner {
  parent: Owner | null;
  disposed = false;
  // Disetel oleh provide()/ErrorBoundary()/Suspense(); dicari lewat rantai parent.
  context: Map<symbol, unknown> | null = null;
  errorHandler: ((err: unknown) => void) | null = null;
  // Debug only: anak Owner di-tracked saat debugEnabled untuk owner-tree.
  children: Set<Owner> | null = null;
  private disposers = new Set<CleanupFn>();

  constructor(parent: Owner | null = currentOwner) {
    this.parent = parent;
    if (debugEnabled) {
      this.children = new Set();
      if (parent?.children) parent.children.add(this);
      else rootOwners.add(this);
    }
  }

  add(d: CleanupFn): void {
    this.disposers.add(d);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Isolasi tiap disposer: throw di salah satu TIDAK boleh menggagalkan
    // sisa subtree. Tanpa ini, satu effect anak yang error saat dispose bikin
    // sibling effect, owner anak, dll. tidak ikut ter-dispose = leak.
    for (const d of this.disposers) {
      try {
        d();
      } catch (err) {
        console.error("sanify: owner disposer threw, continuing chain", err);
      }
    }
    this.disposers.clear();
    if (this.children) {
      this.parent?.children?.delete(this);
      rootOwners.delete(this);
    }
  }
}

export function createOwner(): Owner {
  return new Owner();
}

export function getOwner(): Owner | null {
  return currentOwner;
}

// ── Context (provide/inject lewat rantai owner) ─────────────
export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T;
}

export function createContext<T>(defaultValue: T): Context<T> {
  return { id: Symbol("sanify.context"), defaultValue };
}

export function useContext<T>(ctx: Context<T>): T {
  let owner = currentOwner;
  while (owner) {
    if (owner.context?.has(ctx.id)) return owner.context.get(ctx.id) as T;
    owner = owner.parent;
  }
  return ctx.defaultValue;
}

// Cari errorHandler terdekat di rantai owner (dipakai ErrorBoundary).
export function findErrorHandler(start: Owner | null): ((err: unknown) => void) | null {
  let owner = start;
  while (owner) {
    if (owner.errorHandler) return owner.errorHandler;
    owner = owner.parent;
  }
  return null;
}

// ── Suspense state (dipakai Suspense + resource) ───────────────
export interface SuspenseState {
  increment(): void;
  decrement(): void;
}
const SUSPENSE_KEY = Symbol("sanify.suspense");

export function provideSuspense(owner: Owner, state: SuspenseState): void {
  (owner.context ??= new Map()).set(SUSPENSE_KEY, state);
}

export function useSuspense(): SuspenseState | null {
  let owner = currentOwner;
  while (owner) {
    if (owner.context?.has(SUSPENSE_KEY)) {
      return owner.context.get(SUSPENSE_KEY) as SuspenseState;
    }
    owner = owner.parent;
  }
  return null;
}

export function runWithOwner<T>(owner: Owner, fn: () => T): T {
  const prev = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } finally {
    currentOwner = prev;
  }
}

// Buat scope reaktif yang bisa di-dispose manual. `fn` menerima fungsi dispose;
// semua effect yang dibuat di dalamnya mati saat dispose dipanggil.
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const owner = new Owner();
  return runWithOwner(owner, () => fn(() => owner.dispose()));
}

// ── Devtools API ────────────────────────────────────────────
export interface DebugStats {
  signals: number;
  effects: number;
  pendingEffects: number;
  rootOwners: number;
}

export interface OwnerNode {
  disposed: boolean;
  children: OwnerNode[];
}

function snapshotOwner(o: Owner): OwnerNode {
  return {
    disposed: o.disposed,
    children: o.children ? [...o.children].map(snapshotOwner) : [],
  };
}

// Inspeksi runtime opt-in. enable() memulai pelacakan owner tree + counter;
// stats()/ownerTree() boleh dipanggil kapan saja (mengembalikan 0/[] saat
// belum di-enable). Pemasangan di globalThis memudahkan akses dari dev console.
export const __debug = {
  enable(): void {
    if (debugEnabled) return;
    debugEnabled = true;
    (globalThis as unknown as Record<string, unknown>).__sanify_debug = __debug;
  },
  enabled(): boolean {
    return debugEnabled;
  },
  stats(): DebugStats {
    return {
      signals: signalsCreated,
      effects: effectsCreated,
      pendingEffects: pendingEffects.size,
      rootOwners: rootOwners.size,
    };
  },
  ownerTree(): OwnerNode[] {
    return [...rootOwners].map(snapshotOwner);
  },
};
