// test/list.test.ts — For keyed-list reconciliation (butuh DOM lewat happy-dom)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { For, html, render, signal, batch } = await import("../src/index.ts");

interface Item {
  id: number;
  t: string;
}

function mount(initial: Item[]) {
  const [items, setItems] = signal<Item[]>(initial);
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(
    html`<ul>${For(
      () => items(),
      (it: () => Item, i: () => number) =>
        html`<li>${() => i()}:${() => it().t}</li>`,
      { key: (x: Item) => x.id },
    )}</ul>`,
    c,
  );
  const lis = () => [...c.querySelectorAll("li")];
  return { setItems, lis };
}

test("For: reorder memindahkan elemen DOM yang sama (bukan bikin ulang)", () => {
  const a = { id: 1, t: "a" };
  const b = { id: 2, t: "b" };
  const d = { id: 3, t: "c" };
  const { setItems, lis } = mount([a, b, d]);

  const before = lis();
  expect(before.map((l) => l.textContent)).toEqual(["0:a", "1:b", "2:c"]);

  setItems([d, b, a]);
  batch(() => {});

  const after = lis();
  expect(after.map((l) => l.textContent)).toEqual(["0:c", "1:b", "2:a"]);
  // elemen di-reuse: "c" sekarang di depan tapi objek elemennya sama
  expect(after[0]).toBe(before[2]);
  expect(after[1]).toBe(before[1]);
  expect(after[2]).toBe(before[0]);
});

test("For: tambah & hapus item", () => {
  const a = { id: 1, t: "a" };
  const b = { id: 2, t: "b" };
  const { setItems, lis } = mount([a, b]);
  expect(lis().length).toBe(2);

  setItems([a, b, { id: 3, t: "c" }]);
  batch(() => {});
  expect(lis().map((l) => l.textContent)).toEqual(["0:a", "1:b", "2:c"]);

  setItems([b]);
  batch(() => {});
  expect(lis().map((l) => l.textContent)).toEqual(["0:b"]);
});

test("For: update objek dengan key sama → binding update, elemen tetap", () => {
  const a = { id: 1, t: "a" };
  const b = { id: 2, t: "b" };
  const { setItems, lis } = mount([a, b]);
  const bEl = lis()[1];

  setItems([a, { id: 2, t: "B" }]); // key sama (id 2), objek baru
  batch(() => {});

  expect(lis()[1]!.textContent).toBe("1:B");
  expect(lis()[1]).toBe(bEl); // elemen DOM dipertahankan
});

test("For: index reaktif saat urutan berubah", () => {
  const a = { id: 1, t: "a" };
  const b = { id: 2, t: "b" };
  const { setItems, lis } = mount([a, b]);
  expect(lis().map((l) => l.textContent)).toEqual(["0:a", "1:b"]);

  setItems([b, a]);
  batch(() => {});
  expect(lis().map((l) => l.textContent)).toEqual(["0:b", "1:a"]);
});
