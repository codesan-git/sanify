// test/transition.test.ts — Transition directive: enter/leave class, appear,
// sequential ordering, reduced motion. Memakai duration: 0 supaya fallback
// timer langsung selesai di test (animationend tidak fire di happy-dom).
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { html, render, signal, batch, Transition } = await import("../src/index.ts");

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

test("Transition: enter class TIDAK dipasang saat first mount (appear default off)", async () => {
  const [visible] = signal(true);
  const c = mount(html`<div>
    ${Transition("fade", () => (visible() ? html`<span class="x">hi</span>` : null), { duration: 0 })}
  </div>`);

  const span = c.querySelector("span.x")!;
  expect(span).not.toBeNull();
  expect(span.classList.contains("fade-enter")).toBe(false);
});

test("Transition: appear:true memasang enter class saat first mount, lalu lepas", async () => {
  const c = mount(html`<div>
    ${Transition("fade", () => html`<span class="x">hi</span>`, { duration: 0, appear: true })}
  </div>`);
  const span = c.querySelector("span.x")!;
  expect(span.classList.contains("fade-enter")).toBe(true);

  // Setelah fallback timer (duration 0) → class dilepas.
  await sleep(10);
  expect(span.classList.contains("fade-enter")).toBe(false);
});

test("Transition: ganti konten → leave class di old dulu, lalu new di-mount", async () => {
  const [visible, setVisible] = signal(true);
  const c = mount(html`<div>
    ${Transition("fade", () => (visible() ? html`<span class="x">on</span>` : null), { duration: 0 })}
  </div>`);

  expect(c.querySelector(".x")).not.toBeNull();

  setVisible(false);
  batch(() => {});

  // Sebelum fallback timer fire, old span masih ada dengan class leave.
  const old = c.querySelector("span.x");
  expect(old).not.toBeNull();
  expect(old!.classList.contains("fade-leave")).toBe(true);

  await sleep(10);
  expect(c.querySelector("span.x")).toBeNull(); // sudah di-remove
});

test("Transition: enter class dipasang saat new content masuk setelah leave selesai", async () => {
  const [visible, setVisible] = signal(false);
  const c = mount(html`<div>
    ${Transition("fade", () => (visible() ? html`<span class="x">on</span>` : null), { duration: 0 })}
  </div>`);

  expect(c.querySelector(".x")).toBeNull();

  setVisible(true);
  batch(() => {});

  // First content (kosong→ada) bukan first run karena dir.children() awalnya
  // null. Tapi karena oldEls.length === 0, mount() langsung tanpa leave.
  // Karena ini bukan firstRun lagi, enter class dipasang.
  const span = c.querySelector("span.x")!;
  expect(span).not.toBeNull();
  expect(span.classList.contains("fade-enter")).toBe(true);

  await sleep(10);
  expect(span.classList.contains("fade-enter")).toBe(false);
});

test("Transition: rapid toggle dipotong — nilai terakhir saja yang di-render", async () => {
  const [v, setV] = signal("a");
  const c = mount(html`<div>
    ${Transition("fx", () => html`<span class="x">${() => v()}</span>`, { duration: 20 })}
  </div>`);

  // Ganti banyak kali sebelum animasi pertama selesai.
  setV("b");
  batch(() => {});
  setV("c");
  batch(() => {});
  setV("d");
  batch(() => {});

  await sleep(60);
  expect(c.querySelector("span.x")!.textContent).toBe("d");
});

test("Transition: respect prefers-reduced-motion — skip animasi, langsung swap", async () => {
  const originalMatchMedia = window.matchMedia;
  (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (q) =>
    ({
      matches: q.includes("prefers-reduced-motion"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;

  try {
    const [v, setV] = signal(true);
    const c = mount(html`<div>
      ${Transition("rm", () => (v() ? html`<span class="x">on</span>` : null), { duration: 999, appear: true })}
    </div>`);

    // appear: true tapi reduced-motion → enter class tidak dipasang.
    const span = c.querySelector("span.x")!;
    expect(span.classList.contains("rm-enter")).toBe(false);

    setV(false);
    batch(() => {});
    // Tanpa leave delay: old langsung hilang.
    expect(c.querySelector("span.x")).toBeNull();
  } finally {
    window.matchMedia = originalMatchMedia;
  }
});
