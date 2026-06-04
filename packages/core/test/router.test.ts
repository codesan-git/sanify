// test/router.test.ts — params() & query() (butuh DOM lewat happy-dom)
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const {
  router,
  lazy,
  navigate,
  redirect,
  back,
  forward,
  current,
  params,
  query,
  html,
  render,
  component,
  signal,
  effect,
  batch,
} = await import("../src/index.ts");

// daftarkan rute supaya params() punya pola untuk dicocokkan
router({
  "/user/:id": () => html`<div>user</div>`,
  "/search": () => html`<div>search</div>`,
  "*": () => html`<div>404</div>`,
});

test("params(): mengekstrak parameter route dinamis", () => {
  navigate("/user/42");
  expect(params()).toEqual({ id: "42" });

  navigate("/user/abc");
  expect(params()).toEqual({ id: "abc" });
});

test("query(): membaca query string sebagai URLSearchParams", () => {
  navigate("/search?q=halo&page=2");
  const q = query();
  expect(q.get("q")).toBe("halo");
  expect(q.get("page")).toBe("2");
});

test("params(): reaktif terhadap navigate", () => {
  navigate("/user/1");
  const seen: string[] = [];
  effect(() => {
    seen.push(params().id ?? "-");
  });
  expect(seen).toEqual(["1"]);

  navigate("/user/2");
  batch(() => {});
  expect(seen).toEqual(["1", "2"]);
});

test("redirect(): mengganti route saat ini", () => {
  navigate("/user/5");
  redirect("/user/9");
  expect(params()).toEqual({ id: "9" });
});

test("back()/forward(): bisa dipanggil tanpa error", () => {
  navigate("/user/100");
  navigate("/user/200");
  expect(() => back()).not.toThrow();
  expect(() => forward()).not.toThrow();
});

test("nested: layout induk bertahan, param reaktif tanpa rebuild", () => {
  const view = router({
    "/u": {
      layout: (ctx) => html`<aside>menu</aside><main>${ctx.outlet}</main>`,
      children: {
        "/": () => html`<p class="list">list</p>`,
        "/:id": (ctx) => html`<p class="detail">detail ${() => ctx.params().id}</p>`,
      },
    },
    "*": () => html`<p class="nf">nf</p>`,
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  navigate("/u");
  render(html`<div>${view}</div>`, c);
  batch(() => {});

  expect(c.querySelector("aside")!.textContent).toBe("menu");
  expect(c.querySelector(".list")).not.toBeNull();
  const aside = c.querySelector("aside")!;

  // pindah ke anak detail → layout (aside) harus elemen yang SAMA
  navigate("/u/7");
  batch(() => {});
  expect(c.querySelector("aside")).toBe(aside); // layout bertahan
  expect(c.querySelector(".list")).toBeNull();
  expect(c.querySelector(".detail")!.textContent).toBe("detail 7");
  const detail = c.querySelector(".detail")!;

  // ganti param pada route yang sama → tidak rebuild, hanya teks update
  navigate("/u/8");
  batch(() => {});
  expect(c.querySelector(".detail")).toBe(detail); // elemen sama (param reaktif)
  expect(c.querySelector(".detail")!.textContent).toBe("detail 8");
  expect(c.querySelector("aside")).toBe(aside); // layout tetap bertahan
});

test("scrollRestoration: simpan scrollY ke history.state saat navigate, kembalikan saat popstate", async () => {
  router(
    { "/p1": () => html``, "/p2": () => html`` },
    { scrollRestoration: true },
  );

  navigate("/p1");
  // Simulasi user scroll di /p1
  Object.defineProperty(window, "scrollY", { value: 250, configurable: true });
  navigate("/p2");

  // history.state untuk entry /p1 (sebelumnya) harus menyimpan scrollY.
  // Kita panggil back() — popstate handler merestore.
  let scrolledTo = -1;
  (window as unknown as { scrollTo: (x: number, y: number) => void }).scrollTo = (
    _x,
    y,
  ) => {
    scrolledTo = y;
  };

  back();
  // Restore dijadwalkan via queueMicrotask.
  await new Promise((r) => queueMicrotask(r));
  expect(scrolledTo).toBe(250);
});

test("interceptor: modifier/target dibiarkan default, klik biasa di-intercept", () => {
  router({ "/start": () => html``, "/intercepted": () => html`` });
  navigate("/start");

  const a = document.createElement("a");
  a.setAttribute("data-link", "");
  a.href = "/intercepted";
  document.body.appendChild(a);

  // cmd+click → tidak di-intercept (current tetap)
  a.dispatchEvent(
    new MouseEvent("click", { bubbles: true, button: 0, metaKey: true }),
  );
  expect(current()).toBe("/start");

  // klik kiri biasa → di-intercept
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  expect(current()).toBe("/intercepted");
});

test("lazy: fallback saat loading, render setelah modul dimuat", async () => {
  let resolve!: (v: unknown) => void;
  const p = new Promise((r) => (resolve = r));

  const view = router({
    "/lz": lazy(() => p, "lazy-page", () => html`<i class="fb">memuat</i>`),
    "*": () => html`<div>home</div>`,
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  navigate("/lz");
  render(html`<div>${view}</div>`, c);
  batch(() => {});

  const fbBox = c.querySelector<HTMLElement>(".fb")!.closest("div")!;
  expect(fbBox.style.display).not.toBe("none"); // fallback tampil saat memuat
  expect(c.querySelector(".lp")).toBeNull(); // elemen lazy belum dibuat

  // simulasi side-effect modul (daftar komponen) lalu selesaikan load
  component("lazy-page", () => () => html`<span class="lp">termuat</span>`);
  resolve(true);
  await p;
  await Promise.resolve();
  batch(() => {});

  expect(fbBox.style.display).toBe("none"); // fallback disembunyikan
  expect(c.querySelector(".lp")!.textContent).toBe("termuat");
});

test("loader: fetch dijalankan saat route match, data tampil di ctx.data", async () => {
  const { invalidate } = await import("../src/index.ts");
  invalidate();
  const calls: string[] = [];

  const view = router({
    "/p/:id": {
      loader: async ({ id }) => {
        calls.push(id!);
        return `item-${id}`;
      },
      component: (ctx) =>
        html`<p class="d">${() => (ctx.data() as string) ?? "..."}</p>`,
    },
    "*": () => html`<i></i>`,
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(html`<div>${view}</div>`, c);

  navigate("/p/1");
  batch(() => {});
  expect(c.querySelector(".d")!.textContent).toBe("..."); // belum resolve
  await new Promise((r) => queueMicrotask(r));
  await new Promise((r) => queueMicrotask(r));
  batch(() => {});
  expect(c.querySelector(".d")!.textContent).toBe("item-1");

  // pindah param: loader refetch dengan params baru
  navigate("/p/2");
  batch(() => {});
  await new Promise((r) => queueMicrotask(r));
  await new Promise((r) => queueMicrotask(r));
  batch(() => {});
  expect(c.querySelector(".d")!.textContent).toBe("item-2");
  expect(calls).toEqual(["1", "2"]);

  // kembali ke /p/1 → cache hit, tak fetch lagi
  navigate("/p/1");
  batch(() => {});
  await new Promise((r) => queueMicrotask(r));
  batch(() => {});
  expect(c.querySelector(".d")!.textContent).toBe("item-1");
  expect(calls).toEqual(["1", "2"]);
});

test("guard: redirect saat tak lolos, lolos saat kondisi berubah", async () => {
  const [authed, setAuthed] = signal(false);

  const view = router({
    "/admin": {
      guard: () => (authed() ? undefined : "/login"),
      component: () => html`<p class="admin">rahasia</p>`,
    },
    "/login": () => html`<p class="login">login</p>`,
    "*": () => html`<p class="home">home</p>`,
  });

  const c = document.createElement("div");
  document.body.appendChild(c);
  render(html`<div>${view}</div>`, c);

  navigate("/admin");
  batch(() => {}); // guard → redirect dijadwalkan microtask
  await Promise.resolve(); // microtask: redirect("/login")
  batch(() => {});

  expect(c.querySelector(".admin")).toBeNull();
  expect(c.querySelector(".login")).not.toBeNull();

  // penuhi syarat → route /admin kini lolos
  setAuthed(true);
  navigate("/admin");
  batch(() => {});
  expect(c.querySelector(".admin")!.textContent).toBe("rahasia");
});
