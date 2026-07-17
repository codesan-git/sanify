---
name: sanify-testing
description: Panduan testing untuk project Sanify — unit test signal/effect, test komponen DOM, test async resource/form, test router, mock, memory leak detection. Gunakan saat menulis atau memperbaiki test di project Sanify.
---

# Sanify Testing Skill

Panduan menulis test untuk aplikasi Sanify. Test runner: **Bun** (`bun test`). DOM: **happy-dom**. Semua test ditulis dalam TypeScript.

## Setup

### Dependensi

```json
{
  "devDependencies": {
    "@happy-dom/global-registrator": "^14.x"
  }
}
```

### Test yang butuh DOM: `setup-dom.ts`

```typescript
// test/setup-dom.ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

try {
  GlobalRegistrator.register({ url: "http://localhost:3000/" });
} catch {
  /* sudah terdaftar */
}
```

**PENTING**: Setiap file test yang butuh DOM wajib import ini di baris pertama.

### Struktur file test

```
packages/core/test/
├── setup-dom.ts           ← registrasi happy-dom (shared)
├── signal.test.ts         ← pure logic, tidak perlu DOM
├── component.test.ts      ← DOM (import setup-dom)
├── template.test.ts       ← DOM
├── router.test.ts         ← DOM
├── resource.test.ts       ← DOM (butuh window untuk resource lifecycle)
├── form.test.ts           ← DOM
├── transition.test.ts     ← DOM
├── memory.test.ts         ← DOM (stress test)
└── ...
```

---

## Dua jenis import

### Pure logic test (signal, helpers, store)

```typescript
import { test, expect } from "bun:test";
import { signal, effect, computed, batch } from "@sanify/core";
```

### DOM test (component, template, router, form)

```typescript
import { test, expect } from "bun:test";
import "./setup-dom.ts"; // ← WAJIB baris pertama

// Dynamic import — happy-dom harus register dulu sebelum Sanify di-load
const { component, html, render, batch } = await import("../src/index.ts");
```

**Kenapa dynamic import?** Sanify melakukan registrasi custom element saat module di-load. Kalau happy-dom belum siap, `customElements.define()` gagal. Dynamic import memastikan urutan: setup-dom dulu, baru Sanify.

---

## Pola dasar

### `batch()` — flush efek setelah mutasi signal

Signal set dijadwalkan lewat microtask. Di test, panggil `batch(() => {})` setelah mutasi untuk memaksa flush sinkron:

```typescript
test("contoh batch", () => {
  const [n, setN] = signal(0);
  let runs = 0;
  effect(() => { n(); runs++; });

  expect(runs).toBe(1);  // effect jalan sekali saat register

  setN(1);
  batch(() => {});        // flush — effect jalan lagi
  expect(runs).toBe(2);
});
```

**Aturan**: selalu `batch(() => {})` setelah `set()` kalau kamu mau assert efeknya. Kalau tidak, efek belum jalan.

### `mount()` — helper untuk test template

```typescript
function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}
```

Pakai di setiap test yang render template:

```typescript
test("text reaktif", () => {
  const [name, setName] = signal("Sanify");
  const c = mount(html`<p>${() => name()}</p>`);
  expect(c.querySelector("p")!.textContent).toBe("Sanify");

  setName("Keren");
  batch(() => {});
  expect(c.querySelector("p")!.textContent).toBe("Keren");
});
```

---

## Pure logic test (signal, effect, computed)

### Signal dasar

```typescript
test("signal: get/set", () => {
  const [count, setCount] = signal(0);
  expect(count()).toBe(0);
  setCount(5);
  expect(count()).toBe(5);
  setCount((p) => p + 1);
  expect(count()).toBe(6);
});
```

### Effect — tracking dependency + batch

```typescript
test("effect: jalan saat dependency berubah", () => {
  const [count, setCount] = signal(0);
  const seen: number[] = [];
  effect(() => { seen.push(count()); });

  expect(seen).toEqual([0]);          // effect jalan sekali di awal

  setCount(1);
  batch(() => {});
  expect(seen).toEqual([0, 1]);       // effect re-run setelah set
});
```

### Object.is guard — tidak re-run kalau nilai sama

```typescript
test("signal: Object.is guard", () => {
  const [count, setCount] = signal(0);
  let runs = 0;
  effect(() => { count(); runs++; });

  setCount(0);  // nilai sama
  batch(() => {});
  expect(runs).toBe(1);   // tidak re-run
});
```

### Dynamic dependency

```typescript
test("effect: dependency dinamis", () => {
  const [show, setShow] = signal(true);
  const [a, setA] = signal("a");
  const [b, setB] = signal("b");
  const seen: string[] = [];

  effect(() => { seen.push(show() ? a() : b()); });
  expect(seen).toEqual(["a"]);

  setShow(false);
  batch(() => {});
  expect(seen).toEqual(["a", "b"]);

  setA("a2");     // tidak memicu — a sudah bukan dependency
  batch(() => {});
  expect(seen).toEqual(["a", "b"]);

  setB("b2");     // b sekarang dependency
  batch(() => {});
  expect(seen).toEqual(["a", "b", "b2"]);
});
```

### Cleanup

```typescript
test("effect: cleanup callback", () => {
  const [n, setN] = signal(0);
  const log: string[] = [];
  effect(() => {
    const v = n();
    log.push(`run ${v}`);
    return () => log.push(`cleanup ${v}`); // fungsi return = cleanup
  });

  setN(1);
  batch(() => {});
  expect(log).toEqual(["run 0", "cleanup 0", "run 1"]);
});
```

### Owner dispose

```typescript
test("owner: dispose mematikan efek", () => {
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
  expect(seen).toEqual([0, 1]); // tidak ada lagi
});
```

### createRoot — isolasi scope

```typescript
test("createRoot: dispose", () => {
  const [n, setN] = signal(0);
  const seen: number[] = [];
  let dispose!: () => void;

  createRoot((d) => {
    dispose = d;
    effect(() => { seen.push(n()); });
  });

  expect(seen).toEqual([0]);
  setN(1);
  batch(() => {});
  expect(seen).toEqual([0, 1]);

  dispose();
  setN(2);
  batch(() => {});
  expect(seen).toEqual([0, 1]); // mati setelah dispose
});
```

---

## DOM test — komponen

### Property reaktif

```typescript
test("property reaktif", () => {
  component<{ count: number }>(
    "x-reactive",
    ({ props }) => () => html`<b>${() => props.count()}</b>`,
    { props: ["count"] },
  );

  const el = document.createElement("x-reactive") as HTMLElement & { count: number };
  el.count = 1;
  document.body.appendChild(el);
  expect(el.textContent).toContain("1");

  el.count = 2;
  batch(() => {});
  expect(el.textContent).toContain("2");
});
```

### Atribut converter

```typescript
test("attr converter: number", () => {
  component<{ count: number }>(
    "x-num",
    ({ props }) => () => html`<b>${() => props.count() * 2}</b>`,
    { attrs: { count: "number" } },
  );

  const el = document.createElement("x-num");
  el.setAttribute("count", "21");
  document.body.appendChild(el);
  expect(el.textContent).toContain("42");

  el.setAttribute("count", "10");
  batch(() => {});
  expect(el.textContent).toContain("20");
});
```

### Move/reconnect — tidak render ulang

```typescript
test("component bertahan saat dipindah", async () => {
  let setups = 0;
  component("x-move", () => {
    setups++;
    return () => html`<i>halo</i>`;
  });

  const a = document.createElement("div");
  const b = document.createElement("div");
  document.body.appendChild(a);
  document.body.appendChild(b);

  const el = document.createElement("x-move");
  a.appendChild(el);
  expect(setups).toBe(1);

  // Pindah ke parent lain
  b.appendChild(el);
  await Promise.resolve(); // microtask untuk pending dispose

  expect(setups).toBe(1);           // tidak setup ulang
  expect(el.querySelectorAll("i").length).toBe(1);
});
```

### HMR — re-registrasi + remount

```typescript
test("HMR: re-registrasi menukar setup", () => {
  component("x-hmr", () => () => html`<i>satu</i>`);
  const el = document.createElement("x-hmr");
  document.body.appendChild(el);
  expect(el.textContent).toBe("satu");

  // Simulasi HMR
  component("x-hmr", () => () => html`<i>dua</i>`);
  expect(el.textContent).toBe("dua");
  expect(el.querySelectorAll("i").length).toBe(1); // bukan duplikat
});
```

---

## DOM test — template

### Text hole

```typescript
test("text hole reaktif", () => {
  const [n, setN] = signal(1);
  const c = mount(html`<p>nilai: ${() => n()}</p>`);
  expect(c.querySelector("p")!.textContent).toBe("nilai: 1");
  setN(2);
  batch(() => {});
  expect(c.querySelector("p")!.textContent).toBe("nilai: 2");
});
```

### Atribut multi-part

```typescript
test("atribut multi-part", () => {
  const [v, setV] = signal("primary");
  const c = mount(html`<div class="btn ${() => v()} lg"></div>`);
  expect(c.querySelector("div")!.getAttribute("class")).toBe("btn primary lg");
  setV("danger");
  batch(() => {});
  expect(c.querySelector("div")!.getAttribute("class")).toBe("btn danger lg");
});
```

### Event

```typescript
test("event @click", () => {
  let clicks = 0;
  const c = mount(html`<button @click=${() => clicks++}>x</button>`);
  c.querySelector("button")!.dispatchEvent(new Event("click"));
  expect(clicks).toBe(1);
});
```

### Property binding (`.prop`)

```typescript
test("prop binding", () => {
  const obj = { a: 1 };
  const c = mount(html`<div .fooBar=${obj}></div>`);
  expect((c.querySelector("div") as unknown as { fooBar: unknown }).fooBar).toBe(obj);
});
```

### Spread attribute

```typescript
test("spread attribute", () => {
  const props = {
    class: "card",
    title: "hover-me",
    "@click": () => clicks++,
    ".user": { id: 1 },
  };
  const c = mount(html`<div ${props}></div>`);
  const div = c.querySelector("div")!;
  expect(div.getAttribute("class")).toBe("card");
  expect(div.getAttribute("title")).toBe("hover-me");
  expect((div as unknown as { user: unknown }).user).toEqual({ id: 1 });
});
```

---

## Async test

### `nextTick()` helper

```typescript
function nextTick(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}
```

### Resource test — async fetch

```typescript
test("resource: fetch dasar", async () => {
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
```

### Resource test — mock async

```typescript
test("resource: dedupe in-flight", async () => {
  invalidate(); // bersihkan cache global
  let calls = 0;
  let resolve!: (v: string) => void;
  const p = new Promise<string>((r) => (resolve = r));

  await createRoot(async (dispose) => {
    const a = resource(async () => { calls++; return p; }, { key: "dedupe" });
    const b = resource(async () => { calls++; return "other"; }, { key: "dedupe" });

    expect(calls).toBe(1); // fetcher b tidak dipanggil

    resolve("X");
    await p;
    await nextTick();
    batch(() => {});

    expect(a.data()).toBe("X");
    expect(b.data()).toBe("X");
    dispose();
  });
});
```

### Timer-based test

```typescript
test("resource: staleTime", async () => {
  invalidate();
  let calls = 0;

  await createRoot(async (dispose) => {
    const r = resource(
      async () => { calls++; return `v${calls}`; },
      { key: "stale", staleTime: 10 },
    );
    await nextTick();
    batch(() => {});
    expect(calls).toBe(1);

    // Tunggu cache jadi stale
    await new Promise((res) => setTimeout(res, 25));

    r.refetch();
    await nextTick();
    batch(() => {});
    expect(calls).toBe(2); // refetch karena stale
    dispose();
  });
});
```

**Jangan pakai fake timers** — Bun tidak mendukung `useFakeTimers()`. Gunakan `setTimeout` sungguhan dengan durasi kecil (10–50ms).

---

## Form test

### Setup

```typescript
import { test, expect } from "bun:test";
import "./setup-dom.ts";
const { createForm, html, render } = await import("../src/index.ts");

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}
```

### Register + input event

```typescript
test("form: register sinkron ke values", () => {
  const form = createForm({
    initialValues: { email: "" },
    onSubmit: () => {},
  });

  const c = mount(html`<input ${form.register("email")} />`);
  const input = c.querySelector("input")!;

  input.value = "x@y";
  input.dispatchEvent(new Event("input"));
  expect(form.values.email).toBe("x@y");
});
```

### Validation

```typescript
test("form: validate saat submit", () => {
  let submitted: unknown = null;
  const form = createForm({
    initialValues: { email: "" },
    validate: (v) => (v.email.includes("@") ? {} : { email: "invalid" }),
    onSubmit: (v) => { submitted = v; },
  });

  form.handleSubmit();
  expect(form.errors.email).toBe("invalid");
  expect(form.isValid()).toBe(false);
  expect(submitted).toBeNull(); // onsubmit tidak dipanggil

  form.values.email = "a@b.com";
  form.handleSubmit();
  expect(form.isValid()).toBe(true);
  expect(submitted).toEqual({ email: "a@b.com" });
});
```

### Validate on blur

```typescript
test("form: validateOn 'blur'", () => {
  const form = createForm({
    initialValues: { name: "" },
    validate: (v) => (v.name ? {} : { name: "required" }),
    onSubmit: () => {},
    validateOn: "blur",
  });

  const c = mount(html`<input ${form.register("name")} />`);
  const input = c.querySelector("input")!;

  input.dispatchEvent(new Event("blur"));
  expect(form.touched.name).toBe(true);
  expect(form.errors.name).toBe("required");
});
```

### Async validation

```typescript
test("form: async validation", async () => {
  let resolve!: (v: string | undefined) => void;
  const form = createForm({
    initialValues: { username: "" },
    onSubmit: () => {},
    asyncFieldValidators: {
      username: () => new Promise<string | undefined>((r) => (resolve = r)),
    },
  });

  const c = mount(html`<input ${form.register("username")} />`);
  const input = c.querySelector("input")!;
  input.dispatchEvent(new Event("blur"));

  expect(form.validating()).toBe(true);

  resolve("username already taken");
  await new Promise((r) => setTimeout(r, 10));

  expect(form.validating()).toBe(false);
  expect(form.errors.username).toBe("username already taken");
});
```

### Checkbox & number

```typescript
test("form: checkbox & number", () => {
  const form = createForm({
    initialValues: { agree: false, age: 0 },
    onSubmit: () => {},
  });
  const c = mount(html`
    <input type="checkbox" ${form.register("agree")} />
    <input type="number" ${form.register("age")} />
  `);
  const [chk, num] = c.querySelectorAll("input") as unknown as [HTMLInputElement, HTMLInputElement];

  chk.checked = true;
  chk.dispatchEvent(new Event("input"));
  expect(form.values.agree).toBe(true);

  num.value = "42";
  num.dispatchEvent(new Event("input"));
  expect(form.values.age).toBe(42);
});
```

---

## Router test

### Navigasi + params + query

```typescript
import { test, expect } from "bun:test";
import "./setup-dom.ts";
const { router, navigate, params, query, html, render, batch } = await import("../src/index.ts");

// Daftarkan rute di awal
router({
  "/user/:id": () => html`<div>user</div>`,
  "/search": () => html`<div>search</div>`,
  "*": () => html`<div>404</div>`,
});

test("params: ekstrak parameter route", () => {
  navigate("/user/42");
  expect(params()).toEqual({ id: "42" });
});

test("query: baca query string", () => {
  navigate("/search?q=halo&page=2");
  const q = query();
  expect(q.get("q")).toBe("halo");
  expect(q.get("page")).toBe("2");
});

test("params: reaktif", () => {
  navigate("/user/1");
  const seen: string[] = [];
  effect(() => { seen.push(params().id ?? "-"); });
  expect(seen).toEqual(["1"]);

  navigate("/user/2");
  batch(() => {});
  expect(seen).toEqual(["1", "2"]);
});
```

### Nested route — layout bertahan

```typescript
test("nested: layout bertahan", () => {
  const view = router({
    "/u": {
      layout: (ctx) => html`<aside>menu</aside><main>${ctx.outlet}</main>`,
      children: {
        "/": () => html`<p class="list">list</p>`,
        "/:id": (ctx) => html`<p class="detail">${() => ctx.params().id}</p>`,
      },
    },
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  navigate("/u");
  render(html`<div>${view}</div>`, c);
  batch(() => {});

  const aside = c.querySelector("aside")!;

  navigate("/u/7");
  batch(() => {});
  expect(c.querySelector("aside")).toBe(aside); // elemen SAMA, bukan baru
  expect(c.querySelector(".detail")!.textContent).toBe("7");
});
```

### Lazy route

```typescript
test("lazy: fallback saat loading", async () => {
  let resolve!: (v: unknown) => void;
  const p = new Promise((r) => (resolve = r));

  const view = router({
    "/lz": lazy(() => p, "lazy-page", () => html`<i class="fb">memuat</i>`),
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  navigate("/lz");
  render(html`<div>${view}</div>`, c);
  batch(() => {});

  expect(c.querySelector(".fb")).not.toBeNull();

  component("lazy-page", () => () => html`<span class="lp">termuat</span>`);
  resolve(true);
  await p;
  await Promise.resolve();
  batch(() => {});

  expect(c.querySelector(".lp")!.textContent).toBe("termuat");
});
```

### Guard

```typescript
test("guard: redirect saat tidak lolos", async () => {
  const [authed, setAuthed] = signal(false);
  const view = router({
    "/admin": {
      guard: () => (authed() ? undefined : "/login"),
      component: () => html`<p class="admin">rahasia</p>`,
    },
    "/login": () => html`<p class="login">login</p>`,
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(html`<div>${view}</div>`, c);

  navigate("/admin");
  batch(() => {});
  await Promise.resolve(); // microtask: redirect
  batch(() => {});

  expect(c.querySelector(".admin")).toBeNull();
  expect(c.querySelector(".login")).not.toBeNull();
});
```

---

## Transition test

### Pola khusus

```typescript
import { test, expect } from "bun:test";
import "./setup-dom.ts";
const { html, render, signal, batch, Transition } = await import("../src/index.ts");

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
```

**Kunci**: gunakan `duration: 0` di test. happy-dom tidak me-fire `animationend`/`transitionend`, jadi fallback timer langsung selesai.

```typescript
test("Transition: enter class saat appear:true", async () => {
  const c = mount(html`
    ${Transition("fade", () => html`<span class="x">hi</span>`, { duration: 0, appear: true })}
  `);
  expect(c.querySelector("span.x")!.classList.contains("fade-enter")).toBe(true);

  await sleep(10);
  expect(c.querySelector("span.x")!.classList.contains("fade-enter")).toBe(false);
});

test("Transition: ganti konten — leave dulu, baru mount", async () => {
  const [visible, setVisible] = signal(true);
  const c = mount(html`
    ${Transition("fade", () => visible() ? html`<span class="x">on</span>` : null, { duration: 0 })}
  `);

  setVisible(false);
  batch(() => {});

  expect(c.querySelector("span.x")!.classList.contains("fade-leave")).toBe(true);
  await sleep(10);
  expect(c.querySelector("span.x")).toBeNull(); // di-remove
});
```

### Mock prefers-reduced-motion

```typescript
test("Transition: respect reduced motion", () => {
  const originalMatchMedia = window.matchMedia;
  (window as any).matchMedia = (q: string) => ({
    matches: q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as MediaQueryList);

  try {
    // test di sini...
  } finally {
    window.matchMedia = originalMatchMedia; // selalu restore
  }
});
```

---

## Memory test (deteksi leak)

```typescript
import { test, expect } from "bun:test";
import "./setup-dom.ts";
const { __debug, createRoot, signal, effect, batch } = await import("../src/index.ts");

__debug.enable();

function settle() { batch(() => {}); }

function delta(prev: ReturnType<typeof __debug.stats>) {
  const now = __debug.stats();
  return {
    pendingEffects: now.pendingEffects - prev.pendingEffects,
    rootOwners: now.rootOwners - prev.rootOwners,
  };
}

test("memory: createRoot dispose bersih", () => {
  const base = __debug.stats();
  for (let i = 0; i < 200; i++) {
    createRoot((d) => {
      const [n, setN] = signal(0);
      effect(() => { n(); });
      setN(1);
      settle();
      d(); // dispose
    });
  }
  const d = delta(base);
  expect(d.pendingEffects).toBe(0);
  expect(d.rootOwners).toBe(0);
});
```

**Pola delta**: cek selisih sebelum/sesudah, bukan nilai absolut (test lain ikut mengisi counter global).

---

## Mock & fake

### Mock window API

```typescript
test("mock matchMedia", () => {
  const originalMatchMedia = window.matchMedia;
  (window as any).matchMedia = (q: string) => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as MediaQueryList);

  try {
    // test
  } finally {
    window.matchMedia = originalMatchMedia;
  }
});
```

### Mock fetch

```typescript
test("resource: error handling", async () => {
  invalidate();
  await createRoot(async (dispose) => {
    const r = resource(async () => {
      throw new Error("boom");
    });
    await nextTick();
    batch(() => {});
    expect(r.error()).toBeInstanceOf(Error);
    dispose();
  });
});
```

Tidak perlu mock `fetch` global — cukup throw di fetcher function.

### Mock history / navigation

```typescript
test("mock scrollTo", () => {
  let scrolledTo = -1;
  (window as any).scrollTo = (_x: number, y: number) => {
    scrolledTo = y;
  };
  // test...
  expect(scrolledTo).toBe(250);
});
```

---

## Do's and Don'ts

### ✅ DO

- **Dynamic import** untuk file test yang butuh DOM
- **`batch(() => {})`** setelah setiap `set()` sebelum assert
- **`duration: 0`** di test `Transition`/`TransitionGroup`
- **`createRoot(async (dispose) => { ... })`** untuk test async — scope lifecycle
- **`invalidate()`** di awal test resource — bersihkan cache lintas test
- **Restore mock** di `finally` block
- **Gunakan `nextTick()`** (`queueMicrotask`) bukan `setTimeout(0)`
- **Gunakan delta** (sebelum/sesudah) untuk memory test, bukan nilai absolut
- **Simulasi event asli**: `dispatchEvent(new Event("input"))`, bukan panggil handler
- **Hapus DOM setelah test**: `document.body.innerHTML = ""` atau `el.remove()`

### ❌ DON'T

- **Jangan import Sanify secara static** di file yang butuh DOM — happy-dom harus siap dulu
- **Jangan assert sebelum `batch()`** — efek dijadwalkan async
- **Jangan pakai fake timers** — Bun tidak mendukung `useFakeTimers()`
- **Jangan assert nilai absolut `__debug.stats()`** — test lain ikut berkontribusi
- **Jangan lupa `dispose()`** di `createRoot` — resource/effect leak lintas test
- **Jangan lupa `invalidate()`** di test resource — cache bertahan lintas `createRoot`
- **Jangan mock `customElements`** — pakai happy-dom yang sudah support Web Components

---

## Menjalankan test

```bash
bun test                          # semua test (161 test, 22 file)
bun test test/signal.test.ts      # satu file
bun test --watch                  # watch mode
```

---

## Alur tulis test

1. Tentukan tipe: pure logic atau butuh DOM?
2. Setup import: static (pure) atau dynamic import + `setup-dom.ts` (DOM)
3. Tulis arrange: buat signal, component, render template
4. Mutasi: `set()`, `dispatchEvent()`, `navigate()`
5. Flush: `batch(() => {})` atau `await nextTick()`
6. Assert: `expect(...).toBe(...)`
7. Cleanup: `dispose()`, restore mock, hapus dari DOM

## File referensi

- `sanify` skill — API framework yang di-test
- `packages/core/test/` — 161 test, 22 file (contoh nyata)
- Bun test docs: https://bun.sh/docs/cli/test
