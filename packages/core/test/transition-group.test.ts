// test/transition-group.test.ts — TransitionGroup: enter/leave CSS animation per-item
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const {
  html,
  render,
  signal,
  batch,
  TransitionGroup,
} = await import("../src/index.ts");

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

test("TransitionGroup: render list dengan key stabil", () => {
  const [items] = signal([{ id: 1, text: "a" }, { id: 2, text: "b" }]);

  const c = mount(html`<div>
    ${TransitionGroup(
      "tg",
      () => items(),
      (item) => html`<span class="x">${() => (item() as unknown as { text: string }).text}</span>`,
      { key: (it: { id: number }) => it.id, duration: 0 },
    )}
  </div>`);

  batch(() => {});
  const spans = c.querySelectorAll("span.x");
  expect(spans.length).toBe(2);
  expect(spans[0]!.textContent).toBe("a");
  expect(spans[1]!.textContent).toBe("b");
});

test("TransitionGroup: tambah item baru dapat enter class", async () => {
  const [items, setItems] = signal([{ id: 1, text: "first" }]);

  const c = mount(html`<div>
    ${TransitionGroup(
      "tg",
      () => items(),
      (item) => html`<span class="x">${() => (item() as unknown as { text: string }).text}</span>`,
      { key: (it: { id: number }) => it.id, duration: 0 },
    )}
  </div>`);

  batch(() => {});
  expect(c.querySelectorAll("span.x").length).toBe(1);

  setItems([{ id: 1, text: "first" }, { id: 2, text: "second" }]);
  batch(() => {});

  // Item baru ada di DOM dengan enter class.
  const spans = c.querySelectorAll("span.x");
  expect(spans.length).toBe(2);
  const second = spans[1]!;
  expect(second.textContent).toBe("second");
  expect(second.classList.contains("tg-enter")).toBe(true);

  await sleep(20);
  expect(second.classList.contains("tg-enter")).toBe(false);
});

test("TransitionGroup: hapus item dapat leave class lalu di-remove", async () => {
  const [items, setItems] = signal([{ id: 1, text: "a" }, { id: 2, text: "b" }]);

  const c = mount(html`<div>
    ${TransitionGroup(
      "tg",
      () => items(),
      (item) => html`<span class="x">${() => (item() as unknown as { text: string }).text}</span>`,
      { key: (it: { id: number }) => it.id, duration: 0 },
    )}
  </div>`);

  batch(() => {});
  expect(c.querySelectorAll("span.x").length).toBe(2);

  setItems([{ id: 1, text: "a" }]);
  batch(() => {});

  // Item b masih ada dengan leave class.
  const spans = c.querySelectorAll("span.x");
  expect(spans.length).toBe(2);
  const removed = [...spans].find((s) => s.textContent === "b")!;
  expect(removed).not.toBeNull();
  expect(removed.classList.contains("tg-leave")).toBe(true);

  await sleep(20);
  // Setelah timer, item b hilang.
  expect(c.querySelectorAll("span.x").length).toBe(1);
  expect(c.querySelector("span.x")!.textContent).toBe("a");
});

test("TransitionGroup: reorder memindahkan elemen DOM", () => {
  const [items, setItems] = signal([{ id: 1, text: "a" }, { id: 2, text: "b" }, { id: 3, text: "c" }]);

  const c = mount(html`<div>
    ${TransitionGroup(
      "tg",
      () => items(),
      (item) => html`<span class="x">${() => (item() as unknown as { text: string }).text}</span>`,
      { key: (it: { id: number }) => it.id, duration: 0 },
    )}
  </div>`);

  batch(() => {});
  const before = c.querySelectorAll("span.x");
  const firstEl = before[0]!;

  setItems([{ id: 2, text: "b" }, { id: 1, text: "a" }, { id: 3, text: "c" }]);
  batch(() => {});

  // Elemen pertama (id=1) dipindah — elemen DOM sama (firstEl bertahan).
  const after = c.querySelectorAll("span.x");
  expect(after.length).toBe(3);
  expect(after[0]!.textContent).toBe("b");
  expect(after[1]!.textContent).toBe("a");
  expect(after[1]).toBe(firstEl); // elemen sama, tidak dibuat ulang
});
