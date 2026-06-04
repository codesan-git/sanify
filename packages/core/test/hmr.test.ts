// test/hmr.test.ts — audit perilaku HMR component: dispose effect lama,
// reset state lokal, preservasi nilai prop, no listener doubling, stabil
// di siklus berulang.
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { component, html, signal, batch, effect, onCleanup, __debug } =
  await import("../src/index.ts");

__debug.enable();

test("HMR: effect dari setup lama di-dispose, tidak re-run setelah remount", () => {
  const log: string[] = [];
  const [n, setN] = signal(0);

  component("hmr-effect", () => {
    effect(() => {
      log.push(`v1:${n()}`);
    });
    return () => html`<i>v1</i>`;
  });

  const el = document.createElement("hmr-effect");
  document.body.appendChild(el);
  expect(log).toEqual(["v1:0"]);

  // HMR: setup baru. Effect lama harus mati supaya tidak nyangkut.
  component("hmr-effect", () => {
    effect(() => {
      log.push(`v2:${n()}`);
    });
    return () => html`<i>v2</i>`;
  });

  // Setelah remount, hanya v2 yang re-run pada perubahan signal.
  setN(1);
  batch(() => {});
  expect(log.filter((l) => l.startsWith("v1:"))).toEqual(["v1:0"]); // v1 tidak bertambah
  expect(log.filter((l) => l.startsWith("v2:"))).toContain("v2:0");
  expect(log.filter((l) => l.startsWith("v2:"))).toContain("v2:1");
});

test("HMR: onCleanup dipanggil saat owner lama di-dispose", () => {
  const log: string[] = [];

  component("hmr-cleanup", () => {
    onCleanup(() => log.push("cleanup-v1"));
    return () => html`<i>v1</i>`;
  });

  const el = document.createElement("hmr-cleanup");
  document.body.appendChild(el);

  component("hmr-cleanup", () => {
    onCleanup(() => log.push("cleanup-v2"));
    return () => html`<i>v2</i>`;
  });

  expect(log).toEqual(["cleanup-v1"]); // hanya v1 yang dibersihkan saat remount
});

test("HMR: nilai prop dipertahankan, state lokal di-reset", () => {
  const setupLog: number[] = [];

  component<{ name: string }>(
    "hmr-state",
    ({ props }) => {
      let local = 0;
      setupLog.push(++local);
      return () => html`<span>${() => props.name()}-${local}</span>`;
    },
    { props: ["name"] },
  );

  const el = document.createElement("hmr-state") as HTMLElement & { name: string };
  el.name = "Sat";
  document.body.appendChild(el);
  expect(el.textContent).toBe("Sat-1");

  // HMR: setup yang sama secara semantik. Local state ter-reset (setup jalan
  // lagi dari nol), tapi prop `name` tetap.
  component<{ name: string }>(
    "hmr-state",
    ({ props }) => {
      let local = 100; // start beda biar kelihatan reset-nya
      return () => html`<span>${() => props.name()}-${local}</span>`;
    },
    { props: ["name"] },
  );
  expect(el.textContent).toBe("Sat-100"); // prop bertahan, local reset
});

test("HMR: semua instance hidup ikut remount, bukan hanya yang terakhir", () => {
  component("hmr-multi", () => () => html`<i>v1</i>`);
  const a = document.createElement("hmr-multi");
  const b = document.createElement("hmr-multi");
  const c = document.createElement("hmr-multi");
  document.body.append(a, b, c);
  for (const el of [a, b, c]) expect(el.textContent).toBe("v1");

  component("hmr-multi", () => () => html`<i>v2</i>`);
  for (const el of [a, b, c]) expect(el.textContent).toBe("v2");
});

test("HMR: listener template tidak menumpuk setelah cycle berulang", () => {
  let clicks = 0;

  component("hmr-click", () => () => html`<button @click=${() => clicks++}>x</button>`);
  const el = document.createElement("hmr-click");
  document.body.appendChild(el);

  for (let i = 0; i < 10; i++) {
    component("hmr-click", () => () => html`<button @click=${() => clicks++}>x</button>`);
  }

  el.querySelector("button")!.dispatchEvent(new Event("click"));
  expect(clicks).toBe(1); // sekali, bukan 11
});

test("HMR: 100 siklus tidak menambah pending/rootOwners (no leak)", () => {
  component("hmr-leak", () => () => html`<i>0</i>`);
  const el = document.createElement("hmr-leak");
  document.body.appendChild(el);

  const before = __debug.stats();
  for (let i = 0; i < 100; i++) {
    component("hmr-leak", () => () => html`<i>${i}</i>`);
  }
  const after = __debug.stats();
  expect(after.pendingEffects).toBe(before.pendingEffects);
  // Setiap remount menukar owner instance — jumlah rootOwners tidak boleh
  // bertambah meski ada 100 swap.
  expect(after.rootOwners - before.rootOwners).toBeLessThanOrEqual(0);
});
