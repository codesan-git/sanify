// test/store.test.ts — createStore fine-grained/nested (bebas DOM)
import { test, expect } from "bun:test";
import { createStore, produce } from "../src/store/reactive.ts";
import { effect, batch } from "../src/reactivity/signal.ts";

test("createStore: baca nested fine-grained (sibling tak memicu)", () => {
  const [state, setState] = createStore({
    user: { name: "Agung", age: 1 },
    count: 0,
  });
  const seen: string[] = [];
  effect(() => {
    seen.push(state.user.name);
  });
  expect(seen).toEqual(["Agung"]);

  setState("user", "age", 2); // sibling 'age' → reader 'name' tak re-run
  batch(() => {});
  expect(seen).toEqual(["Agung"]);

  setState("user", "name", "Budi");
  batch(() => {});
  expect(seen).toEqual(["Agung", "Budi"]);
});

test("createStore: setState path dengan nilai & updater", () => {
  const [state, setState] = createStore({ count: 0 });
  setState("count", 5);
  expect(state.count).toBe(5);
  setState("count", (c) => c + 1);
  expect(state.count).toBe(6);
});

test("createStore: setState partial merge di root", () => {
  const [state, setState] = createStore({ a: 1, b: 2 });
  setState({ b: 20 });
  expect(state.a).toBe(1);
  expect(state.b).toBe(20);
});

test("createStore: produce mutasi batch", () => {
  const [state, setState] = createStore({ user: { name: "A" }, count: 0 });
  let runs = 0;
  effect(() => {
    state.user.name;
    state.count;
    runs++;
  });
  expect(runs).toBe(1);

  setState(
    produce((d) => {
      d.user.name = "C";
      d.count = 5;
    }),
  );
  batch(() => {});
  expect(state.user.name).toBe("C");
  expect(state.count).toBe(5);
  expect(runs).toBe(2); // satu batch → satu re-run, bukan dua
});

test("createStore: array reaktif (length & push via produce)", () => {
  const [state, setState] = createStore<{ todos: string[] }>({ todos: [] });
  const lens: number[] = [];
  effect(() => {
    lens.push(state.todos.length);
  });
  expect(lens).toEqual([0]);

  setState(
    produce((d) => {
      d.todos.push("x");
    }),
  );
  batch(() => {});
  expect(lens).toEqual([0, 1]);
  expect(state.todos[0]).toBe("x");
});

test("createStore: assignment langsung ke proxy memicu reader leaf", () => {
  const [state] = createStore({ user: { name: "A", age: 1 } });
  const names: string[] = [];
  const ages: number[] = [];
  effect(() => {
    names.push(state.user.name);
  });
  effect(() => {
    ages.push(state.user.age);
  });
  expect(names).toEqual(["A"]);
  expect(ages).toEqual([1]);

  // Tulis leaf via proxy: cuma reader leaf itu yang re-run.
  state.user.name = "B";
  batch(() => {});
  expect(names).toEqual(["A", "B"]);
  expect(ages).toEqual([1]); // sibling tetap

  // Ganti subtree via assignment: kedua reader re-run karena keduanya membaca
  // melalui `state.user` (key `user` di root berubah → wrap baru).
  state.user = { name: "C", age: 9 };
  batch(() => {});
  expect(names).toEqual(["A", "B", "C"]);
  expect(ages).toEqual([1, 9]);
});

test("createStore: mutasi array via proxy (push & index) reaktif", () => {
  const [state] = createStore<{ todos: { id: number; done: boolean }[] }>({
    todos: [{ id: 1, done: false }],
  });
  const lens: number[] = [];
  const doneFirst: boolean[] = [];
  effect(() => {
    lens.push(state.todos.length);
  });
  effect(() => {
    doneFirst.push(state.todos[0]!.done);
  });

  state.todos.push({ id: 2, done: false });
  batch(() => {});
  expect(lens).toEqual([1, 2]);

  state.todos[0]!.done = true;
  batch(() => {});
  expect(doneFirst).toEqual([false, true]);
});

test("createStore: menambah key baru memicu pembaca key yang absen", () => {
  const [state, setState] = createStore<{ a?: number }>({});
  const seen: Array<number | undefined> = [];
  effect(() => {
    seen.push(state.a);
  });
  expect(seen).toEqual([undefined]);

  setState("a", 5);
  batch(() => {});
  expect(seen).toEqual([undefined, 5]);
});
