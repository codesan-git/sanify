// reactive.ts — createStore: store objek fine-grained/nested berbasis Proxy
// Semua tetap turunan signal: tiap properti yang dibaca punya signal sendiri
// (dibuat lazy), sehingga update satu leaf hanya membangunkan pembacanya saja.

import { signal, batch, type Getter, type Setter } from "../reactivity/signal.ts";

type Updater<V> = (prev: V) => V;

// Penanda fungsi hasil produce() agar setState bisa membedakannya.
const PRODUCE = Symbol("sanify.produce");
type Producer<T> = ((draft: T) => void) & { [PRODUCE]: true };

export function produce<T>(fn: (draft: T) => void): Producer<T> {
  const p = fn as Producer<T>;
  p[PRODUCE] = true;
  return p;
}

function isProducer(v: unknown): v is Producer<unknown> {
  return typeof v === "function" && (v as Partial<Producer<unknown>>)[PRODUCE] === true;
}

function isWrappable(v: unknown): v is object {
  return typeof v === "object" && v !== null;
}

const proxyCache = new WeakMap<object, object>();

function wrap<T extends object>(target: T): T {
  const cached = proxyCache.get(target);
  if (cached) return cached as T;

  const valueSignals = new Map<PropertyKey, [Getter<unknown>, Setter<unknown>]>();
  const structure = signal(0); // di-bump saat key ditambah/dihapus

  function keySignal(key: PropertyKey): [Getter<unknown>, Setter<unknown>] {
    let s = valueSignals.get(key);
    if (!s) {
      s = signal<unknown>((target as Record<PropertyKey, unknown>)[key]);
      valueSignals.set(key, s);
    }
    return s;
  }

  const proxy = new Proxy(target, {
    get(t, key, receiver) {
      if (typeof key === "symbol") return Reflect.get(t, key, receiver);
      if (!(key in t)) {
        structure[0](); // track: kalau key ditambah nanti, pembaca ini re-run
        return undefined;
      }
      const value = keySignal(key)[0]();
      return isWrappable(value) ? wrap(value) : value;
    },

    set(t, key, value, receiver) {
      if (typeof key === "symbol") return Reflect.set(t, key, value, receiver);
      const had = key in t;
      (t as Record<PropertyKey, unknown>)[key] = value;
      keySignal(key)[1](() => value);
      if (!had) structure[1]((n) => (n as number) + 1);
      return true;
    },

    deleteProperty(t, key) {
      if (typeof key === "symbol") return Reflect.deleteProperty(t, key);
      const had = key in t;
      delete (t as Record<PropertyKey, unknown>)[key];
      if (had) {
        valueSignals.get(key)?.[1](() => undefined);
        structure[1]((n) => (n as number) + 1);
      }
      return true;
    },

    has(t, key) {
      structure[0](); // `key in state` reaktif terhadap struktur
      return Reflect.has(t, key);
    },

    ownKeys(t) {
      structure[0](); // iterasi/Object.keys reaktif terhadap struktur
      return Reflect.ownKeys(t);
    },
  });

  proxyCache.set(target, proxy);
  return proxy as T;
}

export interface SetStore<T> {
  (producer: Producer<T>): void;
  (partial: Partial<T>): void;
  <K1 extends keyof T>(k1: K1, value: T[K1] | Updater<T[K1]>): void;
  <K1 extends keyof T, K2 extends keyof T[K1]>(
    k1: K1,
    k2: K2,
    value: T[K1][K2] | Updater<T[K1][K2]>,
  ): void;
  <K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(
    k1: K1,
    k2: K2,
    k3: K3,
    value: T[K1][K2][K3] | Updater<T[K1][K2][K3]>,
  ): void;
  (...args: unknown[]): void;
}

export function createStore<T extends object>(initial: T): [T, SetStore<T>] {
  const proxy = wrap(initial);

  const setState = (...args: unknown[]): void => {
    if (args.length === 1) {
      const arg = args[0];
      if (isProducer(arg)) {
        batch(() => (arg as Producer<T>)(proxy));
        return;
      }
      if (isWrappable(arg)) {
        batch(() => {
          const root = proxy as Record<string, unknown>;
          for (const k of Object.keys(arg)) {
            root[k] = (arg as Record<string, unknown>)[k];
          }
        });
        return;
      }
      throw new Error(
        "setState: argumen tunggal harus objek partial atau produce()",
      );
    }

    const value = args[args.length - 1];
    const path = args.slice(0, -1) as PropertyKey[];
    batch(() => {
      let node = proxy as Record<PropertyKey, unknown>;
      for (let i = 0; i < path.length - 1; i++) {
        node = node[path[i]!] as Record<PropertyKey, unknown>;
      }
      const lastKey = path[path.length - 1]!;
      const next =
        typeof value === "function"
          ? (value as (p: unknown) => unknown)(node[lastKey])
          : value;
      node[lastKey] = next;
    });
  };

  return [proxy, setState as SetStore<T>];
}
