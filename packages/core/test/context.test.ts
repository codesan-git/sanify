// test/context.test.ts — context (provide/useContext) & Portal (butuh DOM)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { component, html, render, createContext, useContext, provide, Portal } =
  await import("../src/index.ts");

const Theme = createContext("light");

test("context: provide → useContext lewat komponen anak", () => {
  let seen = "";
  component("ctx-child", () => {
    seen = useContext(Theme);
    return () => html`<span>${() => seen}</span>`;
  });
  component(
    "ctx-parent",
    () => () =>
      html`<div>
        ${provide(Theme, "dark", () => html`<ctx-child></ctx-child>`)}
      </div>`,
  );

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(html`<ctx-parent></ctx-parent>`, c);

  expect(seen).toBe("dark");
});

test("context: default value bila tak ada provide", () => {
  let seen = "";
  component("ctx-child2", () => {
    seen = useContext(Theme);
    return () => html`<i>x</i>`;
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(html`<ctx-child2></ctx-child2>`, c);

  expect(seen).toBe("light");
});

test("Portal: render ke target lain, bukan di tempat asal", () => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const c = document.createElement("div");
  document.body.appendChild(c);

  render(
    html`<div>${Portal(target, () => html`<b class="pp">halo</b>`)}</div>`,
    c,
  );

  expect(c.querySelector(".pp")).toBeNull();
  expect(target.querySelector(".pp")!.textContent).toBe("halo");
});
