// test/flow.test.ts — control-flow (Show, Switch/Match, Index) — butuh DOM
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { html, render, signal, batch, Show, Switch, Match, Index } = await import(
  "../src/index.ts"
);

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}

test("Show: toggle antara children dan fallback", () => {
  const [on, setOn] = signal(false);
  const c = mount(
    html`<div>
      ${Show(
        () => on(),
        () => html`<b>ya</b>`,
        () => html`<i>tidak</i>`,
      )}
    </div>`,
  );
  expect(c.querySelector("i")!.textContent).toBe("tidak");
  expect(c.querySelector("b")).toBeNull();

  setOn(true);
  batch(() => {});
  expect(c.querySelector("b")!.textContent).toBe("ya");
  expect(c.querySelector("i")).toBeNull();
});

test("Show: tidak membangun ulang children saat kondisi tetap truthy", () => {
  const [n, setN] = signal(1);
  let builds = 0;
  const c = mount(
    html`<div>
      ${Show(
        () => n() > 0,
        () => {
          builds++;
          return html`<b>${() => n()}</b>`;
        },
      )}
    </div>`,
  );
  expect(builds).toBe(1);

  setN(2);
  batch(() => {});
  expect(builds).toBe(1); // masih truthy → children tidak dibangun ulang
  expect(c.querySelector("b")!.textContent).toBe("2"); // binding internal update

  setN(0);
  batch(() => {});
  expect(c.querySelector("b")).toBeNull();
});

test("Show: meneruskan nilai truthy ke children (reaktif, elemen sama)", () => {
  const [user, setUser] = signal<{ name: string } | null>(null);
  const c = mount(
    html`<div>
      ${Show(
        () => user(),
        (u: () => { name: string }) => html`<span class="n">${() => u().name}</span>`,
        () => html`<i class="none">-</i>`,
      )}
    </div>`,
  );
  expect(c.querySelector(".none")).not.toBeNull();
  expect(c.querySelector(".n")).toBeNull();

  setUser({ name: "Ada" });
  batch(() => {});
  expect(c.querySelector(".n")!.textContent).toBe("Ada");
  const span = c.querySelector(".n")!;

  // nilai berubah tapi tetap truthy → tak re-render branch, hanya teks update
  setUser({ name: "Alan" });
  batch(() => {});
  expect(c.querySelector(".n")).toBe(span); // elemen sama
  expect(c.querySelector(".n")!.textContent).toBe("Alan");
});

test("Switch/Match: pilih cabang pertama yang cocok, lalu fallback", () => {
  const [v, setV] = signal("a");
  const c = mount(
    html`<div>
      ${Switch(
        [
          Match(
            () => v() === "a",
            () => html`<p class="x">A</p>`,
          ),
          Match(
            () => v() === "b",
            () => html`<p class="x">B</p>`,
          ),
        ],
        () => html`<p class="x">none</p>`,
      )}
    </div>`,
  );
  expect(c.querySelector(".x")!.textContent).toBe("A");

  setV("b");
  batch(() => {});
  expect(c.querySelector(".x")!.textContent).toBe("B");

  setV("z");
  batch(() => {});
  expect(c.querySelector(".x")!.textContent).toBe("none");
});

test("Index: reuse elemen DOM per posisi saat nilai berubah", () => {
  const [items, setItems] = signal(["a", "b", "c"]);
  const c = mount(
    html`<ul>
      ${Index(
        () => items(),
        (item: () => string) => html`<li>${() => item()}</li>`,
      )}
    </ul>`,
  );
  const lis = [...c.querySelectorAll("li")];
  expect(lis.map((l) => l.textContent)).toEqual(["a", "b", "c"]);

  setItems(["A", "b", "c"]);
  batch(() => {});
  const lis2 = [...c.querySelectorAll("li")];
  expect(lis2.map((l) => l.textContent)).toEqual(["A", "b", "c"]);
  expect(lis2[0]).toBe(lis[0]); // posisi 0 di-reuse, hanya nilainya berubah
});
