// test/error-handling.test.ts — 3 bug defensif:
//   1. onMount throw harus ter-route ke ErrorBoundary terdekat
//   2. Effect cleanup yang throw tidak boleh menggagalkan cleanup berikutnya
//   3. Owner disposer yang throw tidak boleh menggagalkan disposer berikutnya
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const {
  signal,
  effect,
  batch,
  onMount,
  onCleanup,
  createOwner,
  runWithOwner,
  ErrorBoundary,
  component,
  html,
  render,
} = await import("../src/index.ts");

// Silence console.error untuk skenario yang sengaja throw, supaya output test
// tidak penuh noise. Kembalikan setelah blok selesai.
function silentError<T>(fn: () => T): T {
  const orig = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = orig;
  }
}

test("onMount: throw di-route ke ErrorBoundary terdekat", async () => {
  component("om-bad", () => {
    onMount(() => {
      throw new Error("mount-fail");
    });
    return () => html`<i>before</i>`;
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(
    html`<div>
      ${ErrorBoundary(
        (err) => html`<p class="fb">caught:${String(err).includes("mount-fail") ? "ok" : "no"}</p>`,
        () => html`<om-bad></om-bad>`,
      )}
    </div>`,
    c,
  );

  // onMount jalan di microtask berikutnya.
  await Promise.resolve();
  batch(() => {});

  expect(c.querySelector(".fb")?.textContent).toBe("caught:ok");
});

test("Effect.dispose: cleanup pertama throw, cleanup kedua tetap jalan", () => {
  const log: string[] = [];
  const [n, setN] = signal(0);

  silentError(() => {
    effect(() => {
      n();
      onCleanup(() => {
        log.push("a");
        throw new Error("cleanup-a-boom");
      });
      onCleanup(() => log.push("b"));
    });

    // Trigger re-run → cleanup lama (a throw, b harus tetap jalan) sebelum run baru.
    setN(1);
    batch(() => {});
  });

  expect(log).toEqual(["a", "b"]);
});

test("Owner.dispose: disposer pertama throw, sisanya tetap jalan", () => {
  const log: string[] = [];
  const owner = createOwner();

  runWithOwner(owner, () => {
    effect(() => {
      log.push("e1-run");
      onCleanup(() => {
        log.push("e1-cleanup");
        throw new Error("disposer-boom");
      });
    });
    effect(() => {
      log.push("e2-run");
      onCleanup(() => log.push("e2-cleanup"));
    });
    effect(() => {
      log.push("e3-run");
      onCleanup(() => log.push("e3-cleanup"));
    });
  });

  expect(log).toEqual(["e1-run", "e2-run", "e3-run"]);

  silentError(() => owner.dispose());

  // Ketiga cleanup harus jalan walau yang pertama throw.
  expect(log).toContain("e1-cleanup");
  expect(log).toContain("e2-cleanup");
  expect(log).toContain("e3-cleanup");
});

test("Effect cleanup chain: state internal effect tetap konsisten setelah throw", () => {
  // Verifikasi cleanups[] di-reset & deps di-clear meski cleanup throw.
  const [n, setN] = signal(0);
  let runCount = 0;

  silentError(() => {
    effect(() => {
      runCount++;
      n();
      onCleanup(() => {
        throw new Error("first cleanup throw");
      });
    });

    setN(1);
    batch(() => {});
    setN(2);
    batch(() => {});
  });

  // Effect tetap reaktif setelah cleanup error — bukti deps & cleanups
  // di-clear walau ada throw.
  expect(runCount).toBe(3); // initial + 2 updates
});
