// router.ts — History API, nested routes + outlet, param matching reaktif

import { signal, computed, effect, type Getter } from "../reactivity/signal.ts";
import { html, Suspense, Dynamic, type TemplateResult } from "../rendering/template.ts";
import { resource } from "../resource/resource.ts";

export type RouteParams = Record<string, string>;

export interface RouteContext {
  params: Getter<RouteParams>;
  outlet: Getter<TemplateResult>;
  // Hasil loader untuk level ini; undefined bila belum selesai atau tak ada loader.
  data: Getter<unknown>;
}

type RouteHandler = (ctx: RouteContext) => TemplateResult;

// Guard: kembalikan path string untuk redirect, atau void/undefined untuk lolos.
type RouteGuard = (params: RouteParams) => string | void;

// Loader: dijalankan saat route match; hasil di-expose lewat ctx.data. Cache
// dibagikan berdasarkan identitas node + params, jadi navigasi mondar-mandir
// ke path yang sama tidak fetch ulang.
type RouteLoader = (params: RouteParams) => unknown;

// Nilai route: handler daun, atau konfigurasi bersarang (layout + children).
export interface RouteConfig {
  layout?: RouteHandler;
  component?: RouteHandler;
  children?: Routes;
  guard?: RouteGuard;
  loader?: RouteLoader;
}
type RouteEntry = RouteHandler | RouteConfig;
export type Routes = Record<string, RouteEntry>;

interface RouteNode {
  render: RouteHandler;
  guard?: RouteGuard;
  loader?: RouteLoader;
}

// ID stabil per RouteNode untuk dipakai sebagai bagian cache key resource.
// Referensi layoutNode dibagikan antar-child di compileRoutes, jadi nodeId
// yang sama menandai "level induk yang sama" — tidak refetch saat hanya
// child yang berubah.
const nodeIds = new WeakMap<RouteNode, number>();
let nodeIdCounter = 0;
function nodeId(n: RouteNode): number {
  let id = nodeIds.get(n);
  if (id === undefined) {
    id = ++nodeIdCounter;
    nodeIds.set(n, id);
  }
  return id;
}
interface CompiledRoute {
  pattern: RegExp;
  keys: string[];
  chain: RouteNode[]; // [layout..., leaf] — node layout dibagi antar-anak (ref stabil)
}

function joinPath(parent: string, key: string): string {
  if (key === "/") return parent || "/";
  return (parent === "/" ? "" : parent) + key;
}

function compilePattern(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const pattern = path
    .replace(/:[^/]+/g, (m) => {
      keys.push(m.slice(1));
      return "([^/]+)";
    })
    .replace(/\//g, "\\/");
  return { pattern: new RegExp(`^${pattern}$`), keys };
}

function compileRoutes(
  routes: Routes,
  parentPath: string,
  parentChain: RouteNode[],
  out: CompiledRoute[],
): void {
  for (const key of Object.keys(routes)) {
    if (key === "*") continue;
    const val = routes[key]!;
    const path = joinPath(parentPath, key);

    if (typeof val === "function") {
      out.push({ ...compilePattern(path), chain: [...parentChain, { render: val }] });
      continue;
    }

    if (val.children) {
      // Layout level dibagikan oleh seluruh anak (ref-stabil agar `nodeAt`
      // tidak menotifikasi saat hanya child yang berubah). Loader/guard pada
      // RouteConfig dengan children menempel di layout level.
      const layoutNode: RouteNode = {
        render: val.layout ?? ((ctx) => ctx.outlet()),
        guard: val.guard,
        loader: val.loader,
      };
      const chain = [...parentChain, layoutNode];
      if (val.component) {
        out.push({
          ...compilePattern(path),
          chain: [...chain, { render: val.component }],
        });
      }
      compileRoutes(val.children, path, chain, out);
    } else if (val.component) {
      // Leaf-only RouteConfig (tanpa children): loader/guard nempel ke daun.
      out.push({
        ...compilePattern(path),
        chain: [
          ...parentChain,
          { render: val.component, guard: val.guard, loader: val.loader },
        ],
      });
    }
  }
}

// ── State global ────────────────────────────────────────────
const hasWindow = typeof window !== "undefined";

const _path = signal(hasWindow ? window.location.pathname : "/");
const current: Getter<string> = _path[0];
const setCurrent = _path[1];

const _search = signal(hasWindow ? window.location.search : "");
const getSearch = _search[0];
const setSearch = _search[1];

// Pattern flat dari router() terakhir, dipakai params() global.
let activeFlat: CompiledRoute[] = [];

// Diaktifkan via router(routes, { scrollRestoration: true }). Saat true:
// - sebelum navigate, posisi scroll disimpan ke history.state entry sekarang;
// - setelah navigate, scroll dipindah ke (0,0);
// - pada popstate, scroll dikembalikan dari history.state pada microtask
//   berikutnya (setelah effect flush, jadi konten yang berubah sudah ter-render).
let scrollRestoreEnabled = false;
const SCROLL_KEY = "__sanify_scroll";

function saveScroll(): void {
  if (!scrollRestoreEnabled || !hasWindow) return;
  const state = (history.state as Record<string, unknown> | null) ?? {};
  history.replaceState({ ...state, [SCROLL_KEY]: window.scrollY }, "");
}

function restoreScroll(): void {
  if (!scrollRestoreEnabled || !hasWindow) return;
  const state = history.state as Record<string, unknown> | null;
  const y = state?.[SCROLL_KEY];
  if (typeof y === "number") queueMicrotask(() => window.scrollTo(0, y));
}

export { current };

function matchParams(path: string): RouteParams {
  for (const r of activeFlat) {
    const m = r.pattern.exec(path);
    if (m) {
      const params: RouteParams = {};
      r.keys.forEach((k, i) => (params[k] = m[i + 1]!));
      return params;
    }
  }
  return {};
}

// Param route aktif (`:id`), reaktif terhadap perubahan path.
export function params(): RouteParams {
  return matchParams(current());
}

// Query string (`?a=1`) sebagai URLSearchParams, reaktif.
export function query(): URLSearchParams {
  return new URLSearchParams(getSearch());
}

export function navigate(to: string): void {
  const url = new URL(to, window.location.origin);
  if (url.pathname === current() && url.search === getSearch()) return;
  saveScroll(); // simpan posisi sekarang sebelum entry diganti
  history.pushState({}, "", to);
  setCurrent(url.pathname);
  setSearch(url.search);
  if (scrollRestoreEnabled && hasWindow) window.scrollTo(0, 0);
}

export function redirect(to: string): void {
  const url = new URL(to, window.location.origin);
  history.replaceState({}, "", to);
  setCurrent(url.pathname);
  setSearch(url.search);
}

export function back(): void {
  history.back();
}

export function forward(): void {
  history.forward();
}

if (hasWindow) {
  window.addEventListener("popstate", () => {
    setCurrent(window.location.pathname);
    setSearch(window.location.search);
    restoreScroll();
  });

  window.addEventListener("click", (e) => {
    // Biarkan default untuk: klik non-kiri, modifier (buka tab baru), atau yang
    // sudah dicegah di tempat lain.
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target as Element | null;
    const a = target?.closest?.("a[data-link]") as HTMLAnchorElement | null;
    if (!a) return;
    if (a.target && a.target !== "_self") return; // target=_blank dll
    if (a.hasAttribute("download")) return;
    if (a.origin !== window.location.origin) return;

    e.preventDefault();
    navigate(a.pathname + a.search + a.hash);
  });
}

// Route component yang dimuat malas (code-splitting). `loader` mengimpor modul
// yang mendaftarkan custom element `tag`; selama memuat, `fallback` ditampilkan
// lewat Suspense bawaan.
export function lazy(
  loader: () => Promise<unknown>,
  tag: string,
  fallback: () => unknown = () => null,
): RouteHandler {
  return () =>
    html`${Suspense(fallback, () => {
      const res = resource(loader);
      return html`${Dynamic(() => (res.data() !== undefined ? tag : ""))}`;
    })}`;
}

export interface RouterOptions {
  // Aktifkan restorasi posisi scroll pada back/forward. Saat true,
  // history.scrollRestoration disetel ke "manual" supaya browser tidak ikut
  // mengelola, dan scroll disimpan/dipulihkan dari history.state.
  scrollRestoration?: boolean;
}

// ── Router ──────────────────────────────────────────────────
export function router(
  routes: Routes,
  options: RouterOptions = {},
): Getter<TemplateResult> {
  const compiled: CompiledRoute[] = [];
  compileRoutes(routes, "", [], compiled);
  activeFlat = compiled;

  if (options.scrollRestoration && hasWindow) {
    scrollRestoreEnabled = true;
    history.scrollRestoration = "manual";
  }

  const fb = routes["*"];
  const fallback = typeof fb === "function" ? fb : null;

  // Hasil match: chain node + params, redirect (dari guard), atau null.
  type MatchResult =
    | { chain: RouteNode[]; params: RouteParams }
    | { redirect: string }
    | null;

  const match = computed<MatchResult>(() => {
    const path = current();
    for (const r of compiled) {
      const m = r.pattern.exec(path);
      if (m) {
        const p: RouteParams = {};
        r.keys.forEach((k, i) => (p[k] = m[i + 1]!));
        for (const node of r.chain) {
          const res = node.guard?.(p);
          if (typeof res === "string") return { redirect: res };
        }
        return { chain: r.chain, params: p };
      }
    }
    return null;
  });

  // Jalankan redirect dari guard (microtask agar tak menulis signal saat compute).
  effect(() => {
    const m = match();
    if (m && "redirect" in m) {
      const to = m.redirect;
      queueMicrotask(() => redirect(to));
    }
  });

  // Tiap level = boundary reaktif sendiri. nodeAt(depth) ref-stabil → level induk
  // TIDAK re-render saat hanya level anak yang berubah (layout bertahan).
  function level(depth: number): Getter<TemplateResult> {
    const nodeAt = computed<RouteNode | null>(() => {
      const m = match();
      return m && "chain" in m ? (m.chain[depth] ?? null) : null;
    });

    // Resource per level dibuat eager di scope router(), bukan di scope render,
    // supaya hidup tahan ganti-render dari konsumen (childOwner render di-dispose
    // tiap kali re-render). Konsekuensi: useSuspense() tidak otomatis menemukan
    // boundary yang dipasang konsumen — kalau butuh fallback selama loader
    // berjalan, panggil resource() sendiri di dalam komponen.
    const res = resource<unknown>(
      async () => {
        const n = nodeAt();
        if (!n?.loader) return undefined;
        return await n.loader(params());
      },
      {
        // Key: identitas node + params. layoutNode ref-shared antar child →
        // key stabil saat hanya child berubah; param berubah → refetch.
        key: () => {
          const n = nodeAt();
          if (!n?.loader) return undefined;
          return `${nodeId(n)}:${JSON.stringify(params())}`;
        },
      },
    );

    const ctx: RouteContext = {
      params,
      outlet: () => level(depth + 1)(),
      data: res.data,
    };

    return () => {
      const node = nodeAt();
      if (node) return node.render(ctx);
      if (depth === 0) {
        const m = match();
        if (m && "redirect" in m) return html``; // sedang redirect → kosong
        return fallback ? fallback(ctx) : html`<div>404</div>`;
      }
      return html``;
    };
  }

  return level(0);
}
