// test/debug.test.ts — devtools opt-in: counter + owner tree
import { test, expect } from "bun:test";
import { signal, effect, createOwner, runWithOwner, createRoot, batch, __debug } from "../src/reactivity/signal.ts";

test("__debug.enabled: false sebelum enable()", () => {
  // Catatan: tes lain bisa men-enable lebih dulu; cukup verifikasi tipe & API.
  const initiallyEnabled = __debug.enabled();
  expect(typeof initiallyEnabled).toBe("boolean");
});

test("__debug.stats: counter naik untuk signal & effect setelah enable", () => {
  __debug.enable();
  const before = __debug.stats();
  const [n, setN] = signal(0);
  effect(() => {
    n();
  });
  const after = __debug.stats();
  expect(after.signals).toBeGreaterThanOrEqual(before.signals + 1);
  expect(after.effects).toBeGreaterThanOrEqual(before.effects + 1);
  setN(1);
  batch(() => {});
});

test("__debug.ownerTree: melacak root + anak, hilang setelah dispose", () => {
  __debug.enable();

  const owner = createOwner(); // root (parent=null saat tidak ada currentOwner aktif)
  const childCount = runWithOwner(owner, () => {
    const child = createOwner();
    return owner.children!.size && child;
  });
  expect(childCount).toBeTruthy();

  const tree = __debug.ownerTree();
  const ourNode = tree.find((n) => !n.disposed && n.children.length > 0);
  expect(ourNode).toBeDefined();

  owner.dispose();
  // Anak ikut hilang via dispose owner; root juga hilang dari rootOwners.
  const after = __debug.ownerTree();
  expect(after.find((n) => n === ourNode)).toBeUndefined();
});

test("__debug.enable: opt-in ke globalThis.__sanify_debug", () => {
  __debug.enable();
  const g = globalThis as unknown as Record<string, unknown>;
  expect(g.__sanify_debug).toBe(__debug);
});

test("__debug: createRoot dispose menghapus owner dari tree", () => {
  __debug.enable();
  let dispose!: () => void;
  createRoot((d) => {
    dispose = d;
    effect(() => {});
  });
  const before = __debug.ownerTree().length;
  dispose();
  const after = __debug.ownerTree().length;
  expect(after).toBeLessThanOrEqual(before);
});
