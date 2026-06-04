// test/dynamic.test.ts — Dynamic (tag runtime) — butuh DOM
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { component, html, render, signal, batch, Dynamic } = await import(
  "../src/index.ts"
);

test("Dynamic: render tag dari getter, prop reaktif, recreate saat tag berubah", () => {
  component<{ n: number }>(
    "blk-a",
    ({ props }) => () => html`<span class="a">A:${() => props.n()}</span>`,
    { props: ["n"] },
  );
  component<{ n: number }>(
    "blk-b",
    ({ props }) => () => html`<span class="b">B:${() => props.n()}</span>`,
    { props: ["n"] },
  );

  const [tag, setTag] = signal("blk-a");
  const [n, setN] = signal(1);

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(
    html`<div>${Dynamic(() => tag(), { ".n": () => n() })}</div>`,
    c,
  );

  expect(c.querySelector(".a")!.textContent).toBe("A:1");

  // prop reaktif: elemen sama, hanya nilainya berubah
  setN(2);
  batch(() => {});
  expect(c.querySelector(".a")!.textContent).toBe("A:2");

  // tag berubah → elemen dibuat ulang sebagai blk-b
  setTag("blk-b");
  batch(() => {});
  expect(c.querySelector(".a")).toBeNull();
  expect(c.querySelector(".b")!.textContent).toBe("B:2");
});
