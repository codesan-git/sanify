# Changelog

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
