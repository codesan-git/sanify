// test/helpers.test.ts — createSelector + debounced + throttled
import { test, expect } from "bun:test";
import { signal, effect, batch, createRoot } from "../src/reactivity/signal.ts";
import { createSelector, debounced, throttled } from "../src/reactivity/helpers.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test("createSelector: konsumen hanya re-run saat status key-nya berubah", () => {
  createRoot((dispose) => {
    const [sel, setSel] = signal<number>(1);
    const isActive = createSelector(sel);
    const runs: Record<number, number> = {};

    for (const k of [1, 2, 3]) {
      runs[k] = 0;
      effect(() => {
        isActive(k);
        runs[k] = (runs[k] ?? 0) + 1;
      });
    }
    expect(runs).toEqual({ 1: 1, 2: 1, 3: 1 });

    // pindah dari 1 → 2: hanya konsumen k=1 (was-true) & k=2 (now-true) re-run
    setSel(2);
    batch(() => {});
    expect(runs[1]).toBe(2);
    expect(runs[2]).toBe(2);
    expect(runs[3]).toBe(1); // tidak ikut

    // pindah ke key yang tidak dipantau: hanya k=2 yang flip dari true → false
    setSel(99);
    batch(() => {});
    expect(runs[1]).toBe(2); // tetap
    expect(runs[2]).toBe(3); // flip
    expect(runs[3]).toBe(1);

    dispose();
  });
});

test("debounced: meneruskan nilai hanya setelah sumber diam selama ms", async () => {
  await createRoot(async (dispose) => {
    const [s, setS] = signal("a");
    const d = debounced(s, 30);
    expect(d()).toBe("a"); // nilai awal langsung tersedia

    setS("b");
    batch(() => {});
    setS("c");
    batch(() => {});
    // Belum lewat 30ms → masih nilai awal.
    expect(d()).toBe("a");

    await sleep(60);
    batch(() => {});
    expect(d()).toBe("c"); // hanya nilai terakhir yang dirilis
    dispose();
  });
});

test("throttled: leading edge + trailing nilai terakhir", async () => {
  await createRoot(async (dispose) => {
    const [s, setS] = signal(0);
    const t = throttled(s, 40);
    expect(t()).toBe(0); // leading: nilai awal langsung tampil

    setS(1);
    batch(() => {});
    setS(2);
    batch(() => {});
    setS(3);
    batch(() => {});
    // Masih dalam window → t() belum bergerak dari leading 0.
    expect(t()).toBe(0);

    await sleep(80);
    batch(() => {});
    expect(t()).toBe(3); // trailing dengan nilai terakhir
    dispose();
  });
});
