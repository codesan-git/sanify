// test/resource.test.ts — cache lintas-pemanggil + dedupe in-flight + key reaktif
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { resource, invalidate, signal, batch, createRoot } = await import(
  "../src/index.ts"
);

function nextTick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

test("resource: fetch dasar mengisi data setelah promise resolve", async () => {
  await createRoot(async (dispose) => {
    const r = resource(async () => "halo");
    expect(r.loading()).toBe(true);
    expect(r.data()).toBeUndefined();
    await nextTick();
    batch(() => {});
    expect(r.loading()).toBe(false);
    expect(r.data()).toBe("halo");
    dispose();
  });
});

test("resource: cache key — pemanggil kedua langsung dapat data tanpa fetch ulang", async () => {
  invalidate();
  let calls = 0;
  await createRoot(async (dispose) => {
    const a = resource(
      async () => {
        calls++;
        return "first";
      },
      { key: "shared" },
    );
    await nextTick();
    batch(() => {});
    expect(a.data()).toBe("first");
    expect(calls).toBe(1);

    // Pemanggil kedua dengan key sama: harus dapat data dari cache tanpa
    // memanggil fetcher lagi.
    const b = resource(
      async () => {
        calls++;
        return "second";
      },
      { key: "shared" },
    );
    expect(b.data()).toBe("first"); // cache hit (sinkron)
    expect(b.loading()).toBe(false);
    expect(calls).toBe(1);
    dispose();
  });
});

test("resource: dedupe in-flight — dua resource() dengan key sama berbagi satu Promise", async () => {
  invalidate();
  let calls = 0;
  let resolve!: (v: string) => void;
  const p = new Promise<string>((r) => (resolve = r));

  await createRoot(async (dispose) => {
    const a = resource(
      async () => {
        calls++;
        return p;
      },
      { key: "dedupe" },
    );
    const b = resource(
      async () => {
        calls++;
        return "other"; // tak boleh terpanggil
      },
      { key: "dedupe" },
    );

    expect(calls).toBe(1); // fetcher b tidak dipanggil
    expect(a.loading()).toBe(true);
    expect(b.loading()).toBe(true);

    resolve("X");
    await p;
    await nextTick();
    batch(() => {});

    expect(a.data()).toBe("X");
    expect(b.data()).toBe("X");
    dispose();
  });
});

test("resource: key reaktif — perubahan key memicu fetch baru", async () => {
  invalidate();
  const [id, setId] = signal(1);
  const fetched: number[] = [];

  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        const v = id();
        fetched.push(v);
        return `user-${v}`;
      },
      { key: () => id() },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("user-1");

    setId(2);
    batch(() => {});
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("user-2");
    expect(fetched).toEqual([1, 2]);

    // Kembali ke key 1 → cache hit, tidak fetch lagi.
    setId(1);
    batch(() => {});
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("user-1");
    expect(fetched).toEqual([1, 2]); // tidak bertambah
    dispose();
  });
});

test("resource: key getter mengembalikan undefined → reset ke initial, tak fetch", async () => {
  invalidate();
  const [active, setActive] = signal(true);
  let calls = 0;

  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        calls++;
        return "data";
      },
      {
        key: () => (active() ? "k" : undefined),
        initial: "init",
      },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("data");
    expect(calls).toBe(1);

    setActive(false);
    batch(() => {});
    expect(r.data()).toBe("init"); // reset ke initial
    expect(calls).toBe(1); // tidak fetch
    dispose();
  });
});

test("resource: invalidate() menghapus cache → refetch() akan memanggil fetcher", async () => {
  invalidate();
  let calls = 0;
  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        calls++;
        return `v${calls}`;
      },
      { key: "inv" },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v1");

    r.refetch();
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v2"); // refetch melewati cache

    invalidate("inv");
    const r2 = resource(
      async () => {
        calls++;
        return `v${calls}`;
      },
      { key: "inv" },
    );
    await nextTick();
    batch(() => {});
    expect(r2.data()).toBe("v3"); // cache kosong → fetch baru
    dispose();
  });
});

test("resource: staleTime — re-trigger ke cache stale mengembalikan data lama dulu, refresh di latar", async () => {
  invalidate();
  let calls = 0;
  await createRoot(async (dispose) => {
    // Single-consumer SWR: satu resource, key reaktif. Saat key kembali ke
    // nilai yang sudah ter-cache TAPI stale, data lama tampil instan dan
    // refresh latar update data tanpa loading flip.
    const [k, setK] = signal("a");
    const r = resource(
      async () => {
        calls++;
        return `v${calls}-${k()}`;
      },
      { key: () => k(), staleTime: 10 },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v1-a");
    expect(calls).toBe(1);

    // Pindah ke key b → fetch baru.
    setK("b");
    batch(() => {});
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v2-b");
    expect(calls).toBe(2);

    // Tunggu hingga key "a" stale.
    await new Promise((res) => setTimeout(res, 25));

    // Balik ke key a → cache hit (stale): data lama tampil sinkron, loading
    // tetap false. Refresh latar dipicu pada flush yang sama.
    setK("a");
    batch(() => {});
    expect(r.data()).toBe("v1-a"); // langsung data lama
    expect(r.loading()).toBe(false);
    expect(calls).toBe(3); // fetcher latar dipanggil sinkron oleh effect

    // Refresh latar selesai → data baru menyalip data lama.
    await nextTick();
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v3-a");
    dispose();
  });
});

test("resource: staleTime tidak diset → cache tidak pernah stale (kembali ke perilaku default)", async () => {
  invalidate();
  let calls = 0;
  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        calls++;
        return "x";
      },
      { key: "fresh-forever" },
    );
    await nextTick();
    batch(() => {});
    expect(calls).toBe(1);

    await new Promise((r) => setTimeout(r, 30));

    const r2 = resource(
      async () => {
        calls++;
        return "y";
      },
      { key: "fresh-forever" },
    );
    expect(r2.data()).toBe("x");
    expect(calls).toBe(1); // tidak ada refresh latar
    dispose();
    void r;
  });
});

test("resource: refreshOnFocus memicu refetch saat window focus", async () => {
  invalidate();
  let calls = 0;
  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        calls++;
        return `v${calls}`;
      },
      { key: "focus", refreshOnFocus: true },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v1");
    expect(calls).toBe(1);

    window.dispatchEvent(new Event("focus"));
    await nextTick();
    batch(() => {});
    expect(calls).toBe(2);
    expect(r.data()).toBe("v2");

    // Listener dilepas saat scope dispose.
    dispose();
    window.dispatchEvent(new Event("focus"));
    await nextTick();
    expect(calls).toBe(2); // tidak bertambah
  });
});

test("resource: error tidak di-cache — fetch berikutnya mencoba lagi", async () => {
  invalidate();
  let calls = 0;
  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return "ok";
      },
      { key: "err" },
    );
    await nextTick();
    batch(() => {});
    expect(r.error()).toBeInstanceOf(Error);
    expect(r.data()).toBeUndefined();

    r.refetch();
    await nextTick();
    batch(() => {});
    expect(r.error()).toBeUndefined();
    expect(r.data()).toBe("ok");
    dispose();
  });
});
