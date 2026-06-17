# Changelog

## [0.5.3] — 2026-06-17

### Added

- **Warning signal dibaca di setup**: signal getter kini mendeteksi bila dibaca
  di dalam `component()` setup (di luar effect/view). `console.warn` kasih tahu
  user bahwa nilai cuma kebaca sekali — harus dipindah ke view function.
- **Validasi template compile**: `compile()` kini cek recipeIndex out-of-bounds +
  mismatch jumlah hole vs binding. Cegah cryptic error saat runtime karena
  template literal yang salah tulis.
- **Global `onError(fn)` hook**: daftarkan handler untuk error yang lolos dari
  semua ErrorBoundary. Otomatis menangkap `window.onerror` dan
  `unhandledrejection`. Return dispose function.
- **TransitionGroup FLIP animation**: item yang di-reorder kini dianimasikan
  posisinya dengan teknik FLIP (First-Last-Invert-Play). Transform position
  dihitung otomatis, dianimasikan dengan durasi yang sama seperti enter/leave.
  Dihormati `prefers-reduced-motion`.

### Changed

- **Router: per-instance params** — `ctx.params` sekarang pakai compiled routes
  milik router sendiri, bukan global `activeFlat`. Global `params()` tetap ada
  untuk backward-compat (pakai compiled dari router terakhir).
- **TextNode in-place update** — binding reaktif ke nilai primitif kini update
  `nodeValue` TextNode yang sudah ada tanpa bongkar DOM.
- **`files` npm**: `src` tidak lagi di-publish ke npm (hanya `dist`). Ukuran
  package mengecil; Bun `--target=browser` tetap resolusi ke `dist/index.js`.

### Removed

- `template.ts.tmp` — file sisa editan.

### Fixed

- Pisah `build` (JS only) dan `typecheck` (tsc --noEmit) di package.json, biar
  type error gak nge-block JS build.
- Tambah `_note_exports` dan `_note_setup_vs_view` di package.json — dokumentasi
  Bun resolve dist vs src dan pola setup vs view.

---

## [0.5.2] — 2026-06-17

### Removed

- Global mount cache (`mountCache`, `clearMountCache`, `COMPONENT_TAG_KEY`,
  `setComponentTag`) — menyebabkan `onMount` hanya jalan sekali selamanya.
  Kembali ke perilaku semula: `onMount` jalan tiap kali komponen mount.

### Changed

**create-sanify**
- Template dependency `@sanify/core` dinaikkan dari `^0.5.1` ke `^0.5.2`.
  `create-sanify` sendiri bump ke `0.1.4`.

---

## [0.5.1] — 2026-06-17

### Changed

**Template — skip re-render untuk compiled template yang sama**
- Binding reaktif generik di `bindChild` kini membandingkan `strings` reference
  TemplateResult saat ini dengan render sebelumnya. Bila sama, clearRange + render
  ulang di-skip — binding fine-grained yang sudah terpasang tetap jalan dan
  meng-update DOM in-place. Custom element yang sudah mount tidak dihancurkan.

**Router — memoize `level()` per depth**
- `level(depth)` kini mengembalikan getter yang sama untuk depth yang sama.
  `computed`, `resource`, dan `RouteContext` dibuat sekali; mencegah duplikasi
  subscription dan alokasi objek tiap kali `outlet` dipanggil.

**Component — effect wrapper di `doMount`**
- `doMount()` kini membungkus `render(view(), this)` dalam `effect()`. Setiap kali
  signal yang di-track oleh `view()` berubah, komponen re-render otomatis (DOM
  dibersihkan lalu di-render ulang). Child owner sebelumnya di-dispose sebelum
  render baru untuk mencegah kebocoran.

**create-sanify**
- Template dependency `@sanify/core` dinaikkan dari `^0.5.0` ke `^0.5.1`.
  `create-sanify` sendiri bump ke `0.1.3`.

---

## [0.5.0] — 2026-06-12

### Added

**Form — field-level validation**
- `fieldValidators` option: per-field sync validators that run in isolation on blur/input.
  Submit still validates all fields at once. The `schema()` builder now attaches a
  `.fields` property, so passing `schema({...})` as `validate` automatically enables
  field-level validation — zero extra setup.
- `asyncFieldValidators` option: per-field async validators that run on blur.
  Error results are written to the errors store. `validating()` signal is `true`
  while any async validation is in-flight. `handleSubmit()` automatically waits
  for pending async validators before calling `onSubmit`.

**Rendering — TransitionGroup**
- `TransitionGroup(name, each, render, options?)` directive: wraps a keyed list
  with CSS enter/leave animations per item. New items get `${name}-enter` class;
  removed items get `${name}-leave` class and are cleaned up after the animation
  completes (or fallback timer). Respects `prefers-reduced-motion: reduce`.
  Reorder keeps DOM elements alive (like `For`). FLIP animations for position
  changes are not yet supported.

**Types**
- `AsyncFieldValidator` type — `(value: unknown) => Promise<string | undefined>`
- `SchemaResult<T>` type — callable validate function with `.fields` property
- `validating` getter added to `Form<T>` interface
- `TransitionGroupDirective`, `TransitionGroup` exported from core

### Changed

- `handleSubmit()` return type widened to `void | Promise<void>` — it returns a
  Promise when async validators are in-flight.
- `schema()` now returns `SchemaResult<T>` (backward-compatible: still callable).

### Fixed

- Internal `fields` extraction in `createForm` uses a simpler guard (no more nested
  ternary with potential precedence issues).

---

All notable changes to `@sanify/core` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-06-04

Major rebuild after deprecating the 0.1–0.3 experimental line. API surface
grew substantially; the runtime is still under 10 KB gzipped, and the project
is now committed to **CSR-only by design** (no SSR/hydration/streaming in core).

### Added

**Form primitive**
- `createForm` — thin form helper on top of `createStore` + `signal`, with
  `values`, `errors`, `touched`, `submitting`, `submitCount`, `isValid`,
  `register(name)`, `handleSubmit`, `reset`, `setField`.
- `schema(shape)` builder that produces a `validate` function for `createForm`.
- `validators`: `v.string`, `v.email`, `v.number`, `v.boolean`, `v.custom`.

**Resource — write side**
- `mutation(fn, options)` — write-side counterpart to `resource`, tracks
  loading/error/data and supports auto cache invalidation via `invalidates`.
- `createClient({ baseUrl, headers, before, after })` — optional fetch wrapper
  with reactive headers and `before` / `after` interceptors.
- `HttpError` class — thrown by the default `after` interceptor on non-2xx.

**Resource — read side**
- `AbortController` integration: fetcher signature is now
  `(signal: AbortSignal) => Promise<T>`. Aborts on key change, scope dispose,
  and refetch. `AbortError` is silently swallowed.
- `staleTime` option — stale-while-revalidate: cache hit on stale entry
  returns data synchronously and triggers a silent background refresh.
- `refreshOnFocus` option — refetch when the window regains focus.
- `gcTime` option — subscriber-counted eviction of cache entries after
  they're no longer used.
- `setResourceData(key, dataOrUpdater)` — direct cache write for optimistic updates.
- `getResourceData(key)` — read cache without subscribing.
- `invalidate(matcher)` — drop cache entries; matcher can be a string,
  number, or function `(key) => boolean`.
- Per-key version signal: cross-resource updates (`invalidate`, `setResourceData`,
  successful fetch) automatically propagate to subscribed resources.

**Rendering**
- `Transition(name, children, options?)` directive — CSS enter/leave
  animations with `${name}-enter` and `${name}-leave` classes. Sequential
  (out → in), respects `prefers-reduced-motion: reduce`, configurable
  fallback timeout. First-mount animation opt-in via `{ appear: true }`.
- Spread attributes: `<div ${object}>` applies each key per its prefix
  (`@event`, `.prop`, plain attribute). Per-key values may be functions
  for reactivity.

**Components**
- Built-in attrs converter shortcuts: `attrs: { count: "number" }`. Available
  shortcuts: `"string"`, `"number"`, `"boolean"` (presence-based, HTML
  convention), `"json"` (throws on malformed). Custom function converters
  still work as before.

**Router**
- Per-route `loader: (params) => fetcher` option. Results exposed via
  `ctx.data()`. Cache key = node identity + params; layout-level loaders
  share cache across child routes.
- `RouterOptions.scrollRestoration` — opt-in scroll save/restore via
  `history.state`. Sets `history.scrollRestoration = "manual"`.

**Reactivity helpers**
- `createSelector(source, equals?)` — per-key memoised getter. Subscribers
  re-run only when their specific key flips status.
- `debounced(source, ms)` — emits last value after `ms` of quiet.
- `throttled(source, ms)` — leading edge + trailing tail.

**Devtools (opt-in)**
- `__debug.enable()` — installs `globalThis.__sanify_debug` and starts
  tracking owners/signals/effects. Zero cost until enabled.
- `__debug.stats()` and `__debug.ownerTree()`.

### Changed

- Internal attribute marker prefix migrated from `sanify-attr-` to
  `data-sanify-attr-` (valid HTML data attribute, no namespace collision risk).
- `package.json` description rewritten in English and reflects current
  feature set.

### Fixed (defensive)

- `onMount` throws now route to the nearest `ErrorBoundary` via the owner
  chain, consistent with `effect()`.
- Effect cleanup chains are **isolated**: if one cleanup throws, subsequent
  cleanups still run; the error is logged via `console.error`.
- Owner disposer chains are isolated the same way — sibling effects and
  child owners still get disposed.

### Documented

- `CSR-only by design` stance — no SSR/hydration/streaming planned for core.
  See README "Out of scope: SSR" section.
- Touched-field UX pattern for forms — filter error display by
  `form.touched[field] || form.submitCount() > 0` (the React Hook Form /
  Formik convention).

### Removed

- Versions 0.1.0–0.3.2 of `@sanify/core` are **deprecated on npm** with a
  message pointing to ^0.4.0.

## [0.1.0]–[0.3.2] — Pre-history

Experimental versions before the v0.4.0 rebuild. All deprecated on npm;
do not use. See package's deprecation message for details.
