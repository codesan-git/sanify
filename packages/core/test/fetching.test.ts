// test/fetching.test.ts — AbortController, version tracking, mutation, client
import { test, expect } from "bun:test";
import "./setup-dom.ts";

import type { HttpError as HttpErrorType } from "../src/resource/client.ts";

const {
  resource,
  invalidate,
  setResourceData,
  getResourceData,
  mutation,
  createClient,
  HttpError,
  signal,
  batch,
  createRoot,
} = await import("../src/index.ts");

function nextTick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

// ── AbortController ─────────────────────────────────────────
test("resource: AbortController di-pass ke fetcher; abort saat key berubah", async () => {
  invalidate();
  const [id, setId] = signal(1);
  const aborted: number[] = [];

  await createRoot(async (dispose) => {
    const r = resource(
      (signal) =>
        new Promise<string>((resolve, reject) => {
          const captured = id();
          signal.addEventListener("abort", () => {
            aborted.push(captured);
            reject(new DOMException("aborted", "AbortError"));
          });
          setTimeout(() => resolve(`v${captured}`), 30);
        }),
      { key: () => id() },
    );
    void r;

    // Ganti key cepat sebelum fetch pertama selesai.
    setId(2);
    batch(() => {});
    setId(3);
    batch(() => {});

    await new Promise((res) => setTimeout(res, 50));
    // Fetch untuk key 1 & 2 ter-abort; key 3 menyelesaikan normal.
    expect(aborted).toContain(1);
    expect(aborted).toContain(2);
    expect(r.data()).toBe("v3");
    dispose();
  });
});

test("resource: scope dispose abort fetch yang masih berjalan", async () => {
  invalidate();
  let aborted = false;
  let resolveFn!: () => void;

  await createRoot(async (dispose) => {
    void resource((signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<string>((res) => {
        resolveFn = () => res("late");
      });
    });

    // Sebelum fetch selesai, dispose scope.
    dispose();
  });

  expect(aborted).toBe(true);
  resolveFn(); // tidak ada efek samping
});

// ── Version tracking & cross-resource updates ──────────────
test("setResourceData: tulis cache → resource yang membaca key sama re-run", async () => {
  invalidate();

  await createRoot(async (dispose) => {
    const r = resource(
      async () => "fetched",
      { key: "users:42" },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("fetched");

    // Optimistic update — tulis langsung ke cache.
    setResourceData("users:42", "optimistic");
    batch(() => {});
    expect(r.data()).toBe("optimistic");

    // Updater function — terima previous.
    setResourceData<string>("users:42", (prev) => `${prev}!`);
    batch(() => {});
    expect(r.data()).toBe("optimistic!");
    dispose();
  });
});

test("invalidate: matcher fungsi menghapus banyak key sekaligus", async () => {
  invalidate();
  setResourceData("user:1", "a");
  setResourceData("user:2", "b");
  setResourceData("post:1", "c");

  invalidate((k) => k.startsWith("user:"));

  expect(getResourceData<string>("user:1")).toBeUndefined();
  expect(getResourceData<string>("user:2")).toBeUndefined();
  expect(getResourceData<string>("post:1")).toBe("c");
});

test("invalidate: trigger refetch otomatis untuk resource aktif dengan key tersebut", async () => {
  invalidate();
  let calls = 0;

  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        calls++;
        return `v${calls}`;
      },
      { key: "rebuilt" },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v1");
    expect(calls).toBe(1);

    invalidate("rebuilt");
    batch(() => {});
    await nextTick();
    batch(() => {});
    expect(calls).toBe(2);
    expect(r.data()).toBe("v2");
    dispose();
  });
});

// ── mutation() ──────────────────────────────────────────────
test("mutation: lifecycle loading → data, signal observable", async () => {
  let resolveFn!: (v: string) => void;
  const p = new Promise<string>((r) => (resolveFn = r));

  await createRoot(async (dispose) => {
    const m = mutation<{ name: string }, string>(async () => p);
    expect(m.loading()).toBe(false);
    expect(m.data()).toBeUndefined();

    const pending = m.mutate({ name: "x" });
    expect(m.loading()).toBe(true);

    resolveFn("created");
    await pending;
    await nextTick();
    expect(m.loading()).toBe(false);
    expect(m.data()).toBe("created");
    expect(m.error()).toBeUndefined();
    dispose();
  });
});

test("mutation: error path — error signal terisi & promise re-throw", async () => {
  await createRoot(async (dispose) => {
    const m = mutation<void, void>(async () => {
      throw new Error("boom");
    });

    let caught: unknown = null;
    try {
      await m.mutate();
    } catch (e) {
      caught = e;
    }

    expect((caught as Error).message).toBe("boom");
    expect(m.loading()).toBe(false);
    expect((m.error() as Error).message).toBe("boom");
    dispose();
  });
});

test("mutation: invalidates auto-trigger refetch resource pada key terkait", async () => {
  invalidate();
  let fetchCount = 0;

  await createRoot(async (dispose) => {
    const r = resource(
      async () => {
        fetchCount++;
        return `list-v${fetchCount}`;
      },
      { key: "users:list" },
    );
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("list-v1");

    const create = mutation(async (name: string) => ({ id: 99, name }), {
      invalidates: ["users:list"],
    });

    await create.mutate("new user");
    await nextTick();
    batch(() => {});

    expect(fetchCount).toBe(2);
    expect(r.data()).toBe("list-v2");
    dispose();
  });
});

test("mutation: invalidates fungsi dinamis (key berdasar hasil)", async () => {
  invalidate();
  setResourceData("user:1", "old");

  await createRoot(async (dispose) => {
    const m = mutation<number, { id: number; name: string }>(
      async (id) => ({ id, name: `user-${id}` }),
      {
        invalidates: (data) => `user:${data.id}`,
      },
    );

    await m.mutate(1);
    expect(getResourceData("user:1")).toBeUndefined(); // ter-invalidate
    dispose();
  });
});

test("mutation: reset() mengembalikan ke kondisi awal", async () => {
  await createRoot(async (dispose) => {
    const m = mutation<void, string>(async () => "done");
    await m.mutate();
    await nextTick();
    expect(m.data()).toBe("done");

    m.reset();
    expect(m.data()).toBeUndefined();
    expect(m.error()).toBeUndefined();
    expect(m.loading()).toBe(false);
    dispose();
  });
});

// ── createClient ────────────────────────────────────────────
test("createClient: baseUrl + JSON body otomatis di post/put", async () => {
  let lastReq: { url: string; init: RequestInit } | null = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    lastReq = { url: String(url), init: init ?? {} };
    return new Response(JSON.stringify({ ok: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const api = createClient({ baseUrl: "https://api.example.com" });
    const res = await api.post("/users", { name: "Sat" });
    expect(res).toEqual({ ok: 1 });
    expect(lastReq!.url).toBe("https://api.example.com/users");
    expect(lastReq!.init.method).toBe("POST");
    expect(lastReq!.init.body).toBe(`{"name":"Sat"}`);
    expect((lastReq!.init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("createClient: before interceptor menambah header dinamis (mis. auth token)", async () => {
  const [token, setToken] = signal("t1");
  let capturedAuth = "";
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    capturedAuth =
      (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
    return new Response("{}", {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const api = createClient({
      before: (init) => ({
        ...init,
        headers: { ...((init.headers as Record<string, string>) ?? {}), Authorization: `Bearer ${token()}` },
      }),
    });
    await api.get("/me");
    expect(capturedAuth).toBe("Bearer t1");

    setToken("t2");
    await api.get("/me");
    expect(capturedAuth).toBe("Bearer t2");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("createClient: after interceptor — default throw HttpError pada non-2xx", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

  try {
    const api = createClient();
    let caught: unknown = null;
    try {
      await api.get("/protected");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpError);
    expect((caught as HttpErrorType).status).toBe(403);
    expect((caught as HttpErrorType).message).toBe("forbidden");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("createClient: after interceptor custom (mis. handle 401)", async () => {
  let redirected = false;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("", { status: 401 })) as unknown as typeof fetch;

  try {
    const api = createClient({
      after: async (res) => {
        if (res.status === 401) {
          redirected = true;
          throw new HttpError(401, null, "session expired");
        }
        return res.json();
      },
    });
    try {
      await api.get("/me");
    } catch {
      /* expected */
    }
    expect(redirected).toBe(true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("createClient: signal di init diteruskan ke fetch (untuk abort)", async () => {
  let receivedSignal: AbortSignal | null = null;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    receivedSignal = init?.signal ?? null;
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const api = createClient();
    const ctl = new AbortController();
    await api.get("/x", { signal: ctl.signal });
    expect(receivedSignal as AbortSignal | null).toBe(ctl.signal);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── gcTime: eviksi otomatis saat tidak ada subscriber ──────
function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

test("gcTime: entry di-evict setelah subscriber terakhir lepas + gcTime ms", async () => {
  invalidate();

  await createRoot(async (dispose) => {
    const r = resource(async () => "x", { key: "gc-basic", gcTime: 30 });
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("x");
    expect(getResourceData<string>("gc-basic")).toBe("x");
    dispose();
  });

  // Tepat setelah dispose: masih ada (timer belum fire).
  expect(getResourceData<string>("gc-basic")).toBe("x");

  // Setelah > gcTime: ter-evict.
  await sleep(60);
  expect(getResourceData<string>("gc-basic")).toBeUndefined();
});

test("gcTime: subscriber baru sebelum timeout → eviksi dibatalkan", async () => {
  invalidate();
  let dispose1!: () => void;
  let dispose2!: () => void;

  await createRoot(async (d1) => {
    dispose1 = d1;
    const r = resource(async () => "x", { key: "gc-cancel", gcTime: 50 });
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("x");
  });
  // Subscriber pertama lepas — eviksi dijadwalkan.
  dispose1();
  await sleep(15);

  // Subscriber baru datang sebelum 50ms — eviksi harus dibatalkan.
  await createRoot(async (d2) => {
    dispose2 = d2;
    const r2 = resource(async () => "y", { key: "gc-cancel", gcTime: 50 });
    await nextTick();
    batch(() => {});
    expect(r2.data()).toBe("x"); // cache hit (belum ter-evict)
  });

  // Pastikan eviksi yang lama tidak fire — tunggu lewat 50ms total sejak dispose1.
  await sleep(50);
  expect(getResourceData<string>("gc-cancel")).toBe("x");

  dispose2();
  await sleep(70);
  // Sekarang baru ter-evict (50ms setelah dispose2).
  expect(getResourceData<string>("gc-cancel")).toBeUndefined();
});

test("gcTime tidak diset (default Infinity) → entry hidup selamanya", async () => {
  invalidate();

  await createRoot(async (dispose) => {
    const r = resource(async () => "x", { key: "gc-forever" });
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("x");
    dispose();
  });

  await sleep(50);
  expect(getResourceData<string>("gc-forever")).toBe("x");
});

test("gcTime: key reaktif berubah → unsubscribe lama, subscribe baru", async () => {
  invalidate();
  const [k, setK] = signal("a");

  await createRoot(async (dispose) => {
    const r = resource(async () => `v-${k()}`, { key: () => k(), gcTime: 30 });
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v-a");

    setK("b");
    batch(() => {});
    await nextTick();
    batch(() => {});
    expect(r.data()).toBe("v-b");

    // "a" sudah tidak ada subscriber → akan di-evict setelah gcTime.
    expect(getResourceData<string>("a")).toBe("v-a");
    await sleep(50);
    expect(getResourceData<string>("a")).toBeUndefined();
    // "b" masih punya subscriber → tetap di cache.
    expect(getResourceData<string>("b")).toBe("v-b");

    dispose();
  });

  await sleep(50);
  // Setelah dispose, "b" juga ter-evict.
  expect(getResourceData<string>("b")).toBeUndefined();
});

// ── Integrasi penuh: client + resource + mutation ──────────
test("integrasi: resource memakai client.get + AbortSignal otomatis", async () => {
  invalidate();
  const calls: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ name: "Sat" }), {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const api = createClient({ baseUrl: "/api" });
    await createRoot(async (dispose) => {
      const r = resource<{ name: string }>(
        (signal) => api.get("/me", { signal }),
        { key: "me" },
      );
      // Rantai promise: fetch → parseBody → resource subscribe. Drain semuanya.
      await new Promise((res) => setTimeout(res, 0));
      batch(() => {});
      expect(r.data()).toEqual({ name: "Sat" });
      expect(calls).toEqual(["/api/me"]);
      dispose();
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});
