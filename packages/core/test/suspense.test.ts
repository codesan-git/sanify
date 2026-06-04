// test/suspense.test.ts — Suspense + resource (butuh DOM)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { component, html, render, batch, resource, Suspense } = await import(
  "../src/index.ts"
);

test("Suspense: fallback selama resource loading, lalu konten", async () => {
  let resolve!: (v: string) => void;
  const p = new Promise<string>((r) => (resolve = r));

  component("sus-child", () => {
    const data = resource(() => p);
    return () => html`<span class="data">${() => data.data() ?? "?"}</span>`;
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(
    html`<div>
      ${Suspense(
        () => html`<i class="fb">loading</i>`,
        () => html`<sus-child></sus-child>`,
      )}
    </div>`,
    c,
  );
  batch(() => {}); // flush: resource increment → pending > 0

  const fbBox = c.querySelector<HTMLElement>(".fb")!.closest("div")!;
  const contentBox = c.querySelector<HTMLElement>(".data")!.closest("div")!;
  expect(fbBox.style.display).toBe("contents"); // fallback tampil
  expect(contentBox.style.display).toBe("none"); // konten disembunyikan

  // selesaikan fetch
  resolve("halo");
  await p;
  await Promise.resolve();
  batch(() => {});

  expect(fbBox.style.display).toBe("none"); // fallback hilang
  expect(contentBox.style.display).toBe("contents"); // konten tampil
  expect(c.querySelector(".data")!.textContent).toBe("halo");
});
