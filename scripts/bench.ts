// scripts/bench.ts — micro-benchmark untuk operasi umum.
// Bukan js-framework-benchmark resmi; pengukur internal untuk deteksi regresi
// dan dasar angka di docs/README. Memakai happy-dom (lebih lambat dari browser
// asli — angka real browser kira-kira 3-10× lebih cepat untuk operasi DOM).

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

const { html, render, signal, batch, For, createRoot } = await import(
  "../packages/core/src/index.ts"
);

interface Result {
  name: string;
  mean: number;
  median: number;
  p95: number;
  ops: number;
  runs: number;
}

// Setup dijalankan di luar timing supaya angka mencerminkan operasi yang
// disebutkan saja, bukan persiapan-nya. Cleanup mengembalikan owner dsb.
function measure<S>(
  name: string,
  runs: number,
  setup: () => S,
  op: (s: S) => void,
  cleanup: (s: S) => void = () => {},
): Result {
  // warmup
  for (let i = 0; i < Math.min(5, runs); i++) {
    const s = setup();
    op(s);
    cleanup(s);
  }

  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = setup();
    const t0 = performance.now();
    op(s);
    times.push(performance.now() - t0);
    cleanup(s);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / times.length;
  const median = times[Math.floor(times.length / 2)]!;
  const p95 = times[Math.floor(times.length * 0.95)]!;
  return { name, mean, median, p95, ops: 1000 / mean, runs };
}

function row(r: Result): string {
  const ms = (n: number) =>
    n < 1 ? `${(n * 1000).toFixed(1)} µs` : `${n.toFixed(3)} ms`;
  return [
    r.name.padEnd(42),
    ms(r.mean).padStart(11),
    ms(r.median).padStart(11),
    ms(r.p95).padStart(11),
    `${Math.round(r.ops).toLocaleString()} ops/s`.padStart(15),
  ].join(" │ ");
}

const results: Result[] = [];

// 1. create 1k signal — alokasi sinyal kosong saja.
results.push(
  measure(
    "create 1 000 signals",
    50,
    () => ({ dispose: null as null | (() => void) }),
    (s) => {
      createRoot((d) => {
        for (let i = 0; i < 1000; i++) signal(i);
        s.dispose = d;
      });
    },
    (s) => s.dispose?.(),
  ),
);

// 2. set 1k signal terbatch — biaya tracking + flush.
results.push(
  measure(
    "set 1 000 signals (batched)",
    50,
    () => {
      let dispose!: () => void;
      const sigs: Array<ReturnType<typeof signal<number>>> = [];
      createRoot((d) => {
        dispose = d;
        for (let i = 0; i < 1000; i++) sigs.push(signal(0));
      });
      return { sigs, dispose };
    },
    ({ sigs }) => {
      batch(() => {
        for (const [, set] of sigs) set(1);
      });
    },
    ({ dispose }) => dispose(),
  ),
);

// 3. render list 10k item dari nol.
results.push(
  measure(
    "render 10 000 list items (keyed For)",
    10,
    () => ({ dispose: null as null | (() => void), container: document.createElement("div") }),
    (s) => {
      createRoot((d) => {
        const items = Array.from({ length: 10000 }, (_, k) => ({ id: k, text: `r${k}` }));
        const [list] = signal(items);
        render(
          html`<ul>${For(() => list(), (it) => html`<li>${() => it().text}</li>`, { key: (it) => it.id })}</ul>`,
          s.container,
        );
        batch(() => {});
        s.dispose = d;
      });
    },
    (s) => s.dispose?.(),
  ),
);

// 4. swap 2 baris di list 1k yang SUDAH ter-render. Hanya rekonsiliasi
//    keyed-For yang dihitung, bukan render awal.
results.push(
  measure(
    "swap 2 rows in 1 000 (post-mount)",
    50,
    () => {
      let dispose!: () => void;
      const items = Array.from({ length: 1000 }, (_, k) => ({ id: k, text: `r${k}` }));
      const [list, setList] = signal(items);
      const c = document.createElement("div");
      createRoot((d) => {
        dispose = d;
        render(
          html`<ul>${For(() => list(), (it) => html`<li>${() => it().text}</li>`, { key: (it) => it.id })}</ul>`,
          c,
        );
        batch(() => {});
      });
      return { items, setList, dispose };
    },
    ({ items, setList }) => {
      const next = items.slice();
      [next[1], next[998]] = [next[998]!, next[1]!];
      setList(next);
      batch(() => {});
    },
    ({ dispose }) => dispose(),
  ),
);

// 5. partial update: ganti teks 1 row di list 1k yang sudah ter-render via
//    signal per-item. Mengukur fine-grained update murni — tanpa diffing.
results.push(
  measure(
    "update 1 row text in 1 000 (post-mount)",
    50,
    () => {
      let dispose!: () => void;
      const cells = Array.from({ length: 1000 }, (_, k) => {
        const [text, setText] = signal(`r${k}`);
        return { id: k, text, setText };
      });
      const c = document.createElement("div");
      createRoot((d) => {
        dispose = d;
        render(
          html`<ul>${For(() => cells, (it) => html`<li>${() => it().text()}</li>`, { key: (it) => it.id })}</ul>`,
          c,
        );
        batch(() => {});
      });
      return { cells, dispose };
    },
    ({ cells }) => {
      cells[500]!.setText("changed");
      batch(() => {});
    },
    ({ dispose }) => dispose(),
  ),
);

console.log("");
console.log("@sanify/core micro-benchmark (happy-dom; real browser ≈ 3-10× faster on DOM ops)");
console.log("─".repeat(105));
console.log(
  [
    "operation".padEnd(42),
    "mean".padStart(11),
    "median".padStart(11),
    "p95".padStart(11),
    "throughput".padStart(15),
  ].join(" │ "),
);
console.log("─".repeat(105));
for (const r of results) console.log(row(r));
console.log("─".repeat(105));
console.log(`runs/op: ${results.map((r) => r.runs).join(", ")}`);

process.exit(0);
