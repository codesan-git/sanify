// test/boundary.test.ts — ErrorBoundary (butuh DOM)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { component, html, render, signal, batch, ErrorBoundary } = await import(
  "../src/index.ts"
);

test("ErrorBoundary: tangkap error render & tampilkan fallback + reset", () => {
  const [boom, setBoom] = signal(true);

  component("might-fail", () => {
    return () => {
      if (boom()) throw new Error("meledak");
      return html`<p class="ok">aman</p>`;
    };
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(
    html`<div>
      ${ErrorBoundary(
        (err, reset) =>
          html`<button class="fb" @click=${() => reset()}>
            ${() => `err: ${(err as Error).message}`}
          </button>`,
        () => html`<might-fail></might-fail>`,
      )}
    </div>`,
    c,
  );
  batch(() => {}); // flush: error mount → setErrBox dijadwalkan microtask

  // error render anak → fallback tampil
  expect(c.querySelector(".fb")!.textContent!.trim()).toBe("err: meledak");
  expect(c.querySelector(".ok")).toBeNull();

  // perbaiki kondisi lalu reset → render ulang anak yang kini sukses
  setBoom(false);
  batch(() => {});
  c.querySelector<HTMLButtonElement>(".fb")!.click();
  batch(() => {});

  expect(c.querySelector(".ok")!.textContent).toBe("aman");
  expect(c.querySelector(".fb")).toBeNull();
});
