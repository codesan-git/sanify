// test/component.test.ts — perilaku Web Component (butuh DOM lewat happy-dom)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { component, html, render, batch, onMount } = await import("../src/index.ts");

test("component: property reaktif memperbarui DOM", () => {
  component<{ count: number }>(
    "x-reactive",
    ({ props }) => () => html`<b>${() => props.count()}</b>`,
    { props: ["count"] },
  );

  const el = document.createElement("x-reactive") as HTMLElement & {
    count: number;
  };
  el.count = 1;
  document.body.appendChild(el);
  expect(el.textContent).toContain("1");

  el.count = 2;
  batch(() => {}); // paksa flush
  expect(el.textContent).toContain("2");
});

test("component anak menerima objek lewat .prop dari template induk", () => {
  // Pola produksi yang memicu bug upgrade: induk merender anak dengan .prop
  // yang diset sebelum elemen anak tersambung ke dokumen.
  component<{ item: { label: string } }>(
    "x-card",
    ({ props }) => () => html`<span>${() => props.item().label}</span>`,
    { props: ["item"] },
  );

  const container = document.createElement("div");
  document.body.appendChild(container);

  render(html`<x-card .item=${{ label: "halo" }}></x-card>`, container);

  expect(container.textContent).toContain("halo");
});

test("component: bertahan saat dipindah (tidak render ulang / dispose)", async () => {
  let setups = 0;
  component("x-move", () => {
    setups++;
    return () => html`<i>halo</i>`;
  });

  const a = document.createElement("div");
  const b = document.createElement("div");
  document.body.appendChild(a);
  document.body.appendChild(b);

  const el = document.createElement("x-move");
  a.appendChild(el);
  expect(setups).toBe(1);
  expect(el.querySelectorAll("i").length).toBe(1);

  // pindah ke parent lain (remove + insert sinkron, seperti reorder keyed list)
  b.appendChild(el);
  await Promise.resolve();

  expect(setups).toBe(1); // tidak setup ulang
  expect(el.querySelectorAll("i").length).toBe(1); // tidak ada konten ganda
  expect(el.isConnected).toBe(true);
});

test("component: re-registrasi menukar setup & remount instance hidup (HMR)", () => {
  component("x-hmr", () => () => html`<i>satu</i>`);
  const el = document.createElement("x-hmr");
  document.body.appendChild(el);
  expect(el.textContent).toBe("satu");
  expect(el.querySelectorAll("i").length).toBe(1);

  // simulasi HMR: daftarkan ulang tag yang sama dengan setup berbeda
  component("x-hmr", () => () => html`<i>dua</i>`);

  expect(el.textContent).toBe("dua"); // ter-remount di tempat
  expect(el.querySelectorAll("i").length).toBe(1); // bukan duplikat
});

test("attrs converter bawaan: 'number' parse string angka", () => {
  component<{ count: number }>(
    "x-num",
    ({ props }) => () => html`<b>${() => props.count() * 2}</b>`,
    { attrs: { count: "number" } },
  );
  const el = document.createElement("x-num");
  el.setAttribute("count", "21");
  document.body.appendChild(el);
  expect(el.textContent).toContain("42");

  // Update atribut → re-konversi & reaktif.
  el.setAttribute("count", "10");
  batch(() => {});
  expect(el.textContent).toContain("20");

  // Atribut hilang → NaN (ekspos ke user supaya bisa di-handle).
  el.removeAttribute("count");
  batch(() => {});
  expect(el.textContent).toContain("NaN");
});

test("attrs converter bawaan: 'boolean' presence-based", () => {
  component<{ active: boolean }>(
    "x-bool",
    ({ props }) => () => html`<i>${() => (props.active() ? "on" : "off")}</i>`,
    { attrs: { active: "boolean" } },
  );
  const el = document.createElement("x-bool");
  document.body.appendChild(el);
  expect(el.textContent).toContain("off"); // absen → false

  el.setAttribute("active", "");
  batch(() => {});
  expect(el.textContent).toContain("on"); // ada (kosong) → true

  el.setAttribute("active", "false"); // string "false" pun tetap true (HTML convention)
  batch(() => {});
  expect(el.textContent).toContain("on");

  el.removeAttribute("active");
  batch(() => {});
  expect(el.textContent).toContain("off");
});

test("attrs converter bawaan: 'json' parse objek dari atribut", () => {
  component<{ data: { x: number } | null }>(
    "x-json",
    ({ props }) => () => html`<span>${() => props.data()?.x ?? "none"}</span>`,
    { attrs: { data: "json" } },
  );
  const el = document.createElement("x-json");
  el.setAttribute("data", `{"x":7}`);
  document.body.appendChild(el);
  expect(el.textContent).toContain("7");

  el.setAttribute("data", `{"x":99}`);
  batch(() => {});
  expect(el.textContent).toContain("99");

  el.removeAttribute("data");
  batch(() => {});
  expect(el.textContent).toContain("none");
});

test("attrs converter bawaan: 'string' pass-through", () => {
  component<{ label: string | null }>(
    "x-str",
    ({ props }) => () => html`<p>${() => props.label() ?? "—"}</p>`,
    { attrs: { label: "string" } },
  );
  const el = document.createElement("x-str");
  document.body.appendChild(el);
  expect(el.textContent).toContain("—"); // absen → null

  el.setAttribute("label", "halo");
  batch(() => {});
  expect(el.textContent).toContain("halo");
});

test("attrs converter: campur bawaan + fungsi kustom di satu komponen", () => {
  component<{ count: number; tags: string[] }>(
    "x-mix",
    ({ props }) => () =>
      html`<p>${() => `${props.count()}/${props.tags().length}`}</p>`,
    {
      attrs: {
        count: "number",
        tags: (raw) => (raw ?? "").split(",").filter(Boolean),
      },
    },
  );
  const el = document.createElement("x-mix");
  el.setAttribute("count", "3");
  el.setAttribute("tags", "a,b,c");
  document.body.appendChild(el);
  expect(el.textContent).toContain("3/3");
});

test("attrs converter: nama bawaan tidak dikenal → throw saat registrasi", () => {
  expect(() =>
    component(
      "x-bad",
      () => () => html``,
      // @ts-expect-error: "bigint" bukan converter bawaan
      { attrs: { foo: "bigint" } },
    ),
  ).toThrow(/string\/number\/boolean\/json/);
});

test("onMount: jalan sekali setelah komponen mount", async () => {
  let mounted = 0;
  component("x-mount", () => {
    onMount(() => mounted++);
    return () => html`<i>hi</i>`;
  });

  const el = document.createElement("x-mount");
  document.body.appendChild(el);
  expect(mounted).toBe(0); // belum (masih pending microtask)

  await Promise.resolve();
  expect(mounted).toBe(1);
});
