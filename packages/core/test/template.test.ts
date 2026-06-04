// test/template.test.ts — parser/binding (butuh DOM lewat happy-dom)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { html, render, signal, batch } = await import("../src/index.ts");

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}

test("text hole reaktif", () => {
  const [n, setN] = signal(1);
  const c = mount(html`<p>nilai: ${() => n()}</p>`);
  expect(c.querySelector("p")!.textContent).toBe("nilai: 1");
  setN(2);
  batch(() => {});
  expect(c.querySelector("p")!.textContent).toBe("nilai: 2");
});

test("atribut berkutip nilai-penuh", () => {
  const [cls, setCls] = signal("a");
  const c = mount(html`<div class="${() => cls()}"></div>`);
  expect(c.querySelector("div")!.getAttribute("class")).toBe("a");
  setCls("b");
  batch(() => {});
  expect(c.querySelector("div")!.getAttribute("class")).toBe("b");
});

test("atribut tak-berkutip", () => {
  const c = mount(html`<div id=${"x1"}></div>`);
  expect(c.querySelector("div")!.id).toBe("x1");
});

test("atribut multi-part (statis + dinamis, reaktif)", () => {
  const [v, setV] = signal("primary");
  const c = mount(html`<div class="btn ${() => v()} lg"></div>`);
  expect(c.querySelector("div")!.getAttribute("class")).toBe("btn primary lg");
  setV("danger");
  batch(() => {});
  expect(c.querySelector("div")!.getAttribute("class")).toBe("btn danger lg");
});

test("'>' di dalam nilai atribut tidak merusak hole berikutnya", () => {
  const c = mount(html`<div data-x="a>b" title=${"ok"}></div>`);
  const div = c.querySelector("div")!;
  expect(div.getAttribute("data-x")).toBe("a>b");
  expect(div.getAttribute("title")).toBe("ok");
});

test("event @click terpasang", () => {
  let clicks = 0;
  const c = mount(html`<button @click=${() => clicks++}>x</button>`);
  c.querySelector("button")!.dispatchEvent(new Event("click"));
  expect(clicks).toBe(1);
});

test("prop .camelCase mempertahankan kapitalisasi", () => {
  const obj = { a: 1 };
  const c = mount(html`<div .fooBar=${obj}></div>`);
  expect((c.querySelector("div") as unknown as { fooBar: unknown }).fooBar).toBe(
    obj,
  );
});

test("atribut statis & boolean dipertahankan", () => {
  const c = mount(html`<input type="text" disabled />`);
  const input = c.querySelector("input")!;
  expect(input.getAttribute("type")).toBe("text");
  expect(input.hasAttribute("disabled")).toBe(true);
});

test("spread attribute: objek tersebar jadi attr / @event / .prop", () => {
  let clicks = 0;
  const userObj = { id: 1, name: "Sat" };
  const props = {
    class: "card",
    title: "hover-me",
    "@click": () => clicks++,
    ".user": userObj,
  };
  const c = mount(html`<div ${props}></div>`);
  const div = c.querySelector("div")!;
  expect(div.getAttribute("class")).toBe("card");
  expect(div.getAttribute("title")).toBe("hover-me");
  expect((div as unknown as { user: unknown }).user).toBe(userObj);
  div.dispatchEvent(new Event("click"));
  expect(clicks).toBe(1);
});

test("spread attribute: nilai per-key boleh fungsi (reaktif)", () => {
  const [cls, setCls] = signal("a");
  const c = mount(html`<div ${{ class: () => cls() }}></div>`);
  const div = c.querySelector("div")!;
  expect(div.getAttribute("class")).toBe("a");
  setCls("b");
  batch(() => {});
  expect(div.getAttribute("class")).toBe("b");
});

test("spread attribute: digabung dengan atribut statis & dinamis di tag sama", () => {
  const c = mount(html`<div id="static" ${{ "data-x": "spread" }} title=${"dyn"}></div>`);
  const div = c.querySelector("div")!;
  expect(div.id).toBe("static");
  expect(div.getAttribute("data-x")).toBe("spread");
  expect(div.getAttribute("title")).toBe("dyn");
});

test("atribut boolean reaktif: true/false add/remove", () => {
  const [on, setOn] = signal(true);
  const c = mount(html`<button disabled=${() => on()}>x</button>`);
  expect(c.querySelector("button")!.hasAttribute("disabled")).toBe(true);
  setOn(false);
  batch(() => {});
  expect(c.querySelector("button")!.hasAttribute("disabled")).toBe(false);
});
