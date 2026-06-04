// helpers.ts — primitif turunan signal yang sering dipakai (selector, debounce,
// throttle). Semua dibangun dari signal/effect/computed; tak ada mesin baru.

import { signal, effect, computed, untrack, onCleanup, type Getter } from "./signal.ts";

// Selector: pemetaan key → boolean yang HANYA membangunkan konsumen saat
// status (source() === key) miliknya berubah. Cocok untuk highlight "active"
// pada list besar — re-render hanya item lama & item baru, bukan seluruh list.
// Tiap key dialokasi memo sendiri (lazy), Object.is sebagai equals default.
export function createSelector<T>(
  source: () => T,
  equals: (a: T, b: T) => boolean = Object.is,
): (key: T) => boolean {
  const cache = new Map<T, Getter<boolean>>();
  return (key: T) => {
    let memo = cache.get(key);
    if (!memo) {
      memo = computed(() => equals(source(), key));
      cache.set(key, memo);
    }
    return memo();
  };
}

// Debounced getter: hanya merilis nilai setelah `source` diam selama `ms`.
// Update berturut-turut me-reset timer; cleanup di-hook ke owner aktif.
export function debounced<T>(source: () => T, ms: number): Getter<T> {
  const [out, setOut] = signal<T>(untrack(source));
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const v = source();
    clearTimeout(timer);
    timer = setTimeout(() => setOut(() => v), ms);
    return () => clearTimeout(timer);
  });
  onCleanup(() => clearTimeout(timer));
  return out;
}

// Throttled getter: leading edge + trailing — meneruskan nilai pertama
// segera, lalu paling cepat tiap `ms` setelahnya, dengan nilai terakhir
// tetap dirilis di akhir window meski sumber sudah diam.
export function throttled<T>(source: () => T, ms: number): Getter<T> {
  const [out, setOut] = signal<T>(untrack(source));
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending!: T;
  effect(() => {
    const v = source();
    pending = v;
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed >= ms) {
      last = now;
      setOut(() => v);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      last = Date.now();
      setOut(() => pending);
    }, ms - elapsed);
    return () => clearTimeout(timer);
  });
  onCleanup(() => clearTimeout(timer));
  return out;
}
