// test/memory.test.ts — stress test verifikasi tidak ada owner/effect leak
// pada siklus mount/unmount yang berulang. Memakai __debug.stats() untuk
// memastikan counter pending + rootOwners stabil setelah teardown.
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { html, render, signal, effect, batch, For, Show, __debug, createRoot } =
  await import("../src/index.ts");

__debug.enable();

function settle(): void {
  batch(() => {});
}

// Beda counter sebelum/sesudah operasi — yang penting BUKAN angka mutlak
// (test lain ikut mengisi), tapi delta-nya stabil.
function delta(prev: ReturnType<typeof __debug.stats>) {
  const now = __debug.stats();
  return {
    pendingEffects: now.pendingEffects - prev.pendingEffects,
    rootOwners: now.rootOwners - prev.rootOwners,
  };
}

test("memory: createRoot dispose membersihkan owner & pending", () => {
  const base = __debug.stats();
  for (let i = 0; i < 200; i++) {
    createRoot((d) => {
      const [n, setN] = signal(0);
      effect(() => {
      n();
    });
      setN(1);
      settle();
      d();
    });
  }
  const d = delta(base);
  expect(d.pendingEffects).toBe(0);
  expect(d.rootOwners).toBe(0);
});

test("memory: list besar dipasang & dilepas stabil", () => {
  const base = __debug.stats();
  for (let i = 0; i < 30; i++) {
    createRoot((dispose) => {
      const [items] = signal(
        Array.from({ length: 100 }, (_, k) => ({ id: k, text: `r${k}` })),
      );
      const c = document.createElement("div");
      render(
        html`<ul>
          ${For(
            () => items(),
            (it) => html`<li>${() => it().text}</li>`,
            { key: (it) => it.id },
          )}
        </ul>`,
        c,
      );
      settle();
      dispose();
    });
  }
  const d = delta(base);
  expect(d.pendingEffects).toBe(0);
  expect(d.rootOwners).toBe(0);
});

test("memory: Show flip on/off berkali-kali tidak meninggalkan effect", () => {
  const base = __debug.stats();
  createRoot((dispose) => {
    const [on, setOn] = signal(false);
    const c = document.createElement("div");
    render(
      html`<div>
        ${Show(
          () => on(),
          () => html`<span>visible</span>`,
          () => html`<span>hidden</span>`,
        )}
      </div>`,
      c,
    );
    for (let i = 0; i < 100; i++) {
      setOn(i % 2 === 0);
      settle();
    }
    dispose();
  });
  const d = delta(base);
  expect(d.pendingEffects).toBe(0);
  expect(d.rootOwners).toBe(0);
});

test("memory: signal setter berkali-kali tidak menumpuk pending", () => {
  const base = __debug.stats();
  createRoot((dispose) => {
    const [n, setN] = signal(0);
    effect(() => {
      n();
    });
    for (let i = 0; i < 1000; i++) {
      setN(i);
      settle();
    }
    dispose();
  });
  const d = delta(base);
  expect(d.pendingEffects).toBe(0);
  expect(d.rootOwners).toBe(0);
});
