// flow.ts — primitif control-flow (Show, Switch/Match, Index).
// Semua turunan signal: mengembalikan getter yang dipasang ke lubang reaktif
// `${...}` di template, lalu ditangani bindChild seperti biasa.

import { computed, type Getter } from "../reactivity/signal.ts";
import { For, TransitionGroup } from "./template.ts";

// Tampilkan `children` saat `when` truthy, jika tidak `fallback`. Hanya
// merender ulang saat truthiness BERUBAH (bukan tiap perubahan dependency).
// `children` menerima getter nilai truthy (ter-narrow non-null), tetap reaktif:
//   Show(() => user(), (u) => html`${() => u().name}`)
export function Show<T>(
  when: () => T,
  children: (value: () => NonNullable<T>) => unknown,
  fallback?: () => unknown,
): () => unknown {
  const cond = computed(() => !!when());
  const value = () => when() as NonNullable<T>;
  return () => (cond() ? children(value) : fallback ? fallback() : null);
}

export interface MatchCase {
  when: () => unknown;
  children: () => unknown;
}

export function Match(when: () => unknown, children: () => unknown): MatchCase {
  return { when, children };
}

// Render `children` dari case pertama yang `when`-nya truthy, jika tidak
// `fallback`. Re-render hanya saat case aktif berpindah.
export function Switch(
  cases: MatchCase[],
  fallback?: () => unknown,
): () => unknown {
  const active = computed(() => {
    for (let i = 0; i < cases.length; i++) {
      if (cases[i]!.when()) return i;
    }
    return -1;
  });
  return () => {
    const i = active();
    return i >= 0 ? cases[i]!.children() : fallback ? fallback() : null;
  };
}

// List yang di-key by POSISI: elemen DOM dipertahankan per indeks, nilai item
// diperbarui di tempat saat berubah (pasangan `For` untuk data primitif).
export function Index<T>(
  each: () => readonly T[],
  render: (item: Getter<T>, index: Getter<number>) => unknown,
) {
  return For(each, render, { key: (_item, i) => i });
}

// Re-export TransitionGroup untuk discoverability.
export { TransitionGroup };
