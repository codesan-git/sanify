// test/signal.test.ts
import { test, expect } from "bun:test";
import { signal, effect, computed, batch, untrack, on, onCleanup, createRoot, createOwner, runWithOwner } from "../src/reactivity/signal.ts";

test("signal: get/set dasar", () => {
  const [count, setCount] = signal(0);
  expect(count()).toBe(0);
  setCount(5);
  expect(count()).toBe(5);
  setCount((p) => p + 1);
  expect(count()).toBe(6);
});

test("effect: jalan saat dependency berubah", () => {
  const [count, setCount] = signal(0);
  const seen: number[] = [];
  effect(() => { seen.push(count()); });
  expect(seen).toEqual([0]);
  setCount(1);
  batch(() => {}); // paksa flush
  expect(seen).toEqual([0, 1]);
});

test("signal: Object.is guard menghindari run sia-sia", () => {
  const [count, setCount] = signal(0);
  let runs = 0;
  effect(() => {
    count();
    runs++;
  });
  setCount(0); // sama → tidak ada run baru
  batch(() => {});
  expect(runs).toBe(1);
});

test("batch: efek hanya jalan sekali untuk banyak set", () => {
  const [a, setA] = signal(0);
  const [b, setB] = signal(0);
  let runs = 0;
  effect(() => {
    a();
    b();
    runs++;
  });
  expect(runs).toBe(1);
  batch(() => {
    setA(1);
    setB(1);
  });
  expect(runs).toBe(2); // bukan 3
});

test("computed: nilai turunan reaktif", () => {
  const [n, setN] = signal(2);
  const double = computed(() => n() * 2);
  expect(double()).toBe(4);
  setN(5);
  batch(() => {});
  expect(double()).toBe(10);
});

test("effect: cleanup callback dipanggil sebelum run ulang", () => {
  const [n, setN] = signal(0);
  const log: string[] = [];
  effect(() => {
    const v = n();
    log.push(`run ${v}`);
    return () => log.push(`cleanup ${v}`);
  });
  setN(1);
  batch(() => {});
  expect(log).toEqual(["run 0", "cleanup 0", "run 1"]);
});

test("owner: dispose mematikan efek di dalamnya", () => {
  const [n, setN] = signal(0);
  const seen: number[] = [];
  const owner = createOwner();
  runWithOwner(owner, () => {
    effect(() => { seen.push(n()); });
  });
  setN(1);
  batch(() => {});
  expect(seen).toEqual([0, 1]);
  owner.dispose();
  setN(2);
  batch(() => {});
  expect(seen).toEqual([0, 1]); // tak ada lagi setelah dispose
});

test("effect: dependency dinamis (cleanup melepas langganan lama)", () => {
  const [show, setShow] = signal(true);
  const [a, setA] = signal("a");
  const [b, setB] = signal("b");
  const seen: string[] = [];
  effect(() => { seen.push(show() ? a() : b()); });
  expect(seen).toEqual(["a"]);

  setShow(false);
  batch(() => {});
  expect(seen).toEqual(["a", "b"]);

  // sekarang harus bergantung pada b, bukan a
  setA("a2");
  batch(() => {});
  expect(seen).toEqual(["a", "b"]); // a tak memicu apa-apa

  setB("b2");
  batch(() => {});
  expect(seen).toEqual(["a", "b", "b2"]);
});

test("untrack: baca tanpa berlangganan", () => {
  const [a, setA] = signal(0);
  const [b, setB] = signal(0);
  const seen: number[] = [];
  effect(() => {
    seen.push(a() + untrack(() => b()));
  });
  expect(seen).toEqual([0]);

  setB(10); // b dibaca lewat untrack → tidak memicu re-run
  batch(() => {});
  expect(seen).toEqual([0]);

  setA(1); // a tetap tracked → re-run, baca nilai b terbaru (10)
  batch(() => {});
  expect(seen).toEqual([0, 11]);
});

test("onCleanup: jalan sebelum run ulang dan saat dispose effect", () => {
  const [n, setN] = signal(0);
  const log: string[] = [];
  const dispose = effect(() => {
    const v = n();
    log.push(`run ${v}`);
    onCleanup(() => log.push(`cleanup ${v}`));
  });
  setN(1);
  batch(() => {});
  expect(log).toEqual(["run 0", "cleanup 0", "run 1"]);

  dispose();
  expect(log).toEqual(["run 0", "cleanup 0", "run 1", "cleanup 1"]);
});

test("onCleanup: di dalam owner jalan saat owner dispose", () => {
  const owner = createOwner();
  const log: string[] = [];
  runWithOwner(owner, () => {
    onCleanup(() => log.push("bye"));
  });
  expect(log).toEqual([]);
  owner.dispose();
  expect(log).toEqual(["bye"]);
});

test("createRoot: dispose mematikan effect di dalamnya", () => {
  const [n, setN] = signal(0);
  const seen: number[] = [];
  let dispose!: () => void;
  createRoot((d) => {
    dispose = d;
    effect(() => {
      seen.push(n());
    });
  });
  expect(seen).toEqual([0]);

  setN(1);
  batch(() => {});
  expect(seen).toEqual([0, 1]);

  dispose();
  setN(2);
  batch(() => {});
  expect(seen).toEqual([0, 1]); // tak ada lagi setelah dispose
});

test("on: hanya re-run saat deps berubah, fn jalan untracked", () => {
  const [a, setA] = signal(0);
  const [b, setB] = signal(100);
  const seen: Array<[number, number | undefined]> = [];
  effect(
    on(
      () => a(),
      (v, prev) => {
        b(); // dibaca untracked → tidak ikut memicu
        seen.push([v, prev]);
      },
    ),
  );
  expect(seen).toEqual([[0, undefined]]);

  setB(200);
  batch(() => {});
  expect(seen).toEqual([[0, undefined]]); // b bukan dependency

  setA(1);
  batch(() => {});
  expect(seen).toEqual([
    [0, undefined],
    [1, 0],
  ]);
});

test("on: opsi defer melewati run pertama", () => {
  const [a, setA] = signal(0);
  const seen: number[] = [];
  effect(
    on(
      () => a(),
      (v) => {
        seen.push(v);
      },
      { defer: true },
    ),
  );
  expect(seen).toEqual([]); // run pertama dilewati

  setA(1);
  batch(() => {});
  expect(seen).toEqual([1]);
});
