# Sanify Frontend

[![npm version](https://img.shields.io/npm/v/@sanify/core.svg?color=fb923c)](https://www.npmjs.com/package/@sanify/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@sanify/core?label=min%2Bgzip&color=fb923c)](https://bundlephobia.com/package/@sanify/core)
[![license](https://img.shields.io/npm/l/@sanify/core?color=fb923c)](./LICENSE)

A fine-grained frontend framework built on native Web Components. Solid-style signals, Light DOM (Tailwind-friendly), no virtual DOM, no global diffing — **~10 KB gzipped**, **CSR-only by design**.

> Built to scratch a specific itch: Solid-style fine-grained reactivity on top of native Web Components, with Light DOM so Tailwind just works, no virtual DOM, no build step required. It's everything I'd actually use to ship a small SPA fast — signals, store, router, resource, mutation, HTTP client, forms — wrapped in ~10 KB. Not trying to replace anything; just what I reach for personally.

Created by Satria Agung Nugraha ([@codesan-git](https://github.com/codesan-git)).

```ts
import { component, signal, html } from "@sanify/core";

component("hello-world", () => {
  const [count, setCount] = signal(0);
  return () => html`
    <button @click=${() => setCount((n) => n + 1)}>
      clicked ${() => count()} times
    </button>
  `;
});
```

```html
<hello-world></hello-world>
```

That's the whole programming model.

## Why

| Choice | Reason |
| --- | --- |
| Fine-grained signals | One binding = one tiny effect on one node. No diffing, no reconciliation overhead |
| Native Web Components | The framework's "component" is just `customElements.define` with extras — works with any other framework, any router, any test runner |
| Light DOM | Global CSS (Tailwind, design tokens) works out of the box; no Shadow DOM plumbing |
| Tagged template literals (`html\`...\``) | Zero build step required; templates compile **once** per literal at runtime and are cached forever |
| No virtual DOM | Updates touch exactly the node that changed |
| **CSR-only by design** | No SSR, no hydration, no streaming. Keeps the runtime small and focused on apps/dashboards. See [out-of-scope below](#out-of-scope-ssr) |
| Everything is "just signals" | Templates, components, stores, the router, and resources are all consumers of the same 200-line reactivity core |

## Bundle size

Measured with `bun run size` against `packages/core/src/index.ts`:

| Format | Size |
| --- | --- |
| Minified | 18.0 KB |
| Gzipped | 7.0 KB |
| Brotli | 6.2 KB |

That's the entire framework: reactivity + templates + components + flow + store + router + resource. Re-run `bun run size` after edits to see the delta.

## Performance baseline

Run `bun run bench` (happy-dom; real browser is roughly 3-10× faster on DOM ops). Indicative numbers on an M-series machine:

| Operation | Median |
| --- | --- |
| Create 1 000 signals | 30 µs |
| Set 1 000 signals (batched) | 35 µs |
| Update 1 row text in 1 000-item list (fine-grained) | **27 µs** |
| Swap 2 rows in 1 000 (keyed reconciliation) | 6.3 ms |
| Render 10 000 items from scratch | 219 ms |

The 27 µs update is the headline: a single signal change touches one node, even when 999 siblings exist.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.0
- TypeScript 5.9 (installed as a dev dependency)

## Setup

```bash
bun install
```

## Quickstart (new project)

```bash
bun create sanify my-app
cd my-app && bun install && bun dev
```

`bun create sanify` scaffolds a minimal project pre-wired to `@sanify/core` with HMR.

## Quickstart (in this repo)

```bash
bun install
bun dev          # example app at http://localhost:54712
bun test         # all workspace tests
bun run typecheck
bun run build
```

Open the example in two tabs — the todo list syncs across them (`persisted` with `sync: true`).

## Module overview

The whole API surface lives under five modules. Each has its own deep-dive:

| Module | Source | Docs | What's inside |
| --- | --- | --- | --- |
| **Reactivity** | `packages/core/src/reactivity/` | [docs/reactivity.md](./docs/reactivity.md) | `signal`, `effect`, `computed`, `batch`, `untrack`, `on`, owner/context, `createSelector`, `debounced`, `throttled`, `__debug` |
| **Rendering** | `packages/core/src/rendering/` | [docs/rendering.md](./docs/rendering.md) | `html`, `render`, `For`, `Show`, `Switch`, `Match`, `Index`, `Portal`, `ErrorBoundary`, `Suspense`, `Dynamic`, `Transition`, `provide`, `component` |
| **Resource** | `packages/core/src/resource/` | [docs/resource.md](./docs/resource.md) | `resource` (read), `mutation` (write), `createClient` (interceptors), cache helpers, AbortController integration, Suspense |
| **Router** | `packages/core/src/router/` | [docs/router.md](./docs/router.md) | `router`, `lazy`, `navigate`, `params`, `query`, nested routes, guards, loaders |
| **Store** | `packages/core/src/store/` | [docs/store.md](./docs/store.md) | `createStore`, `produce`, `persisted` (cross-tab sync) |
| **Form** | `packages/core/src/form/` | [docs/form.md](./docs/form.md) | `createForm` (values, errors, touched, submit lifecycle, `register()` for spread), `schema` + `validators` |

Below is the cheat sheet — head into the per-module docs for everything else.

### Reactivity (the foundation)

```ts
import { signal, effect, computed, batch, untrack } from "@sanify/core";

const [count, setCount] = signal(0);
const doubled = computed(() => count() * 2);
effect(() => console.log(doubled())); // logs 0, then 2 after setCount(1)

batch(() => {
  setCount(1);
  setCount(2); // effect only sees the final value, runs once
});
```

Owner-based lifetimes mean every effect knows what scope it lives in. When the scope (a component, a `createRoot`, a route boundary) is disposed, every effect under it is torn down.

See [docs/reactivity.md](./docs/reactivity.md).

### Rendering

```ts
import { html, For, Show, component } from "@sanify/core";

component("todo-list", () => {
  const [todos, setTodos] = signal<{ id: number; text: string; done: boolean }[]>([]);
  return () => html`
    ${Show(
      () => todos().length === 0,
      () => html`<p>no todos yet</p>`,
      () => html`
        <ul>
          ${For(
            () => todos(),
            (todo) => html`
              <li class=${() => (todo().done ? "done" : "")}>${() => todo().text}</li>
            `,
            { key: (t) => t.id },
          )}
        </ul>
      `,
    )}
  `;
});
```

Template rules (the #1 source of bugs):

| Syntax | Semantics |
| --- | --- |
| `${() => value()}` | Reactive — wrap in a function or it evaluates once |
| `name=${value}` | Attribute (coerced to string) |
| `.name=${value}` | Property (objects, numbers, booleans into a child) |
| `@event=${handler}` | Event listener (added once, not reactive) |

`Show` / `For` / `Switch` re-render only when the *structural* condition changes (truthiness, active case, list keys) — they don't re-run on every dependency tick.

See [docs/rendering.md](./docs/rendering.md).

### Resource

```ts
import { createClient, resource, mutation, invalidate } from "@sanify/core";

// Reusable fetch wrapper with base URL + auth header + error normalisation
const api = createClient({
  baseUrl: "/api",
  headers: () => (token() ? { Authorization: `Bearer ${token()}` } : {}),
});

// Read: reactive fetch, cached, abortable
const user = resource(
  (signal) => api.get<User>(`/users/${id()}`, { signal }),
  { key: () => `user:${id()}`, staleTime: 30_000 },
);

// Write: trigger + auto-invalidate
const updateUser = mutation(
  (patch: Partial<User>) => api.patch<User>(`/users/${id()}`, patch),
  { invalidates: () => [`user:${id()}`] },
);

await updateUser.mutate({ name: "New Name" });
// updateUser.loading() / .error() / .data() — reactive signals
```

`resource` provides reactive reads with cache, dedupe, SWR (`staleTime`), focus refresh, and AbortController integration. `mutation` covers writes with loading/error tracking and cache invalidation. `createClient` is an optional thin fetch wrapper with `before`/`after` interceptors for auth, base URL, and error shape — composable with both.

See [docs/resource.md](./docs/resource.md).

### Router

```ts
import { router, html, render } from "@sanify/core";

const view = router({
  "/": () => html`<home-page></home-page>`,
  "/users/:id": {
    loader: ({ id }) => fetch(`/api/users/${id}`).then((r) => r.json()),
    component: (ctx) => html`<user-detail .user=${() => ctx.data()}></user-detail>`,
  },
  "/dashboard": {
    layout: (ctx) => html`<aside>menu</aside><main>${ctx.outlet}</main>`,
    children: {
      "/": () => html`<overview></overview>`,
      "/reports": () => html`<reports></reports>`,
    },
  },
  "*": () => html`<not-found></not-found>`,
});
render(html`<main>${view}</main>`, document.body);
```

Layouts persist across child navigation (the layout node is reference-shared). `loader` results are cached by node identity + params — navigating back to a recently visited route is instant. Add `data-link` to `<a>` to opt into client-side navigation.

See [docs/router.md](./docs/router.md).

### Store

```ts
import { createStore, produce, persisted } from "@sanify/core";

const [state, setState] = createStore({ user: { name: "Sat", age: 26 } });

// Idiomatic: assign directly to the proxy.
state.user.name = "Satria";
state.user.age++;

// `setState` is for batched bursts, updater functions, or programmatic paths.
setState(produce((d) => { d.user.name = "X"; d.user.age = 30; }));

const [theme, setTheme] = persisted("theme", "light", { sync: true });
```

`createStore` is a Proxy where each accessed leaf lazily becomes its own signal — reading `state.user.name` only re-runs when *that* leaf changes, and writing `state.user.name = "X"` updates that same signal. `persisted` mirrors a signal to `localStorage` (or any `Storage`) with optional debounce and cross-tab sync.

See [docs/store.md](./docs/store.md).

### Form

```ts
import { createForm, html, render, Show } from "@sanify/core";

const form = createForm({
  initialValues: { email: "", password: "" },
  validate: (v) => (v.email.includes("@") ? {} : { email: "invalid" }),
  onSubmit: async (values) => api.login(values),
});

render(html`
  <form @submit=${form.handleSubmit}>
    <input ${form.register("email")} />
    ${Show(() => form.errors.email, () => html`<p>${() => form.errors.email}</p>`)}
    <button disabled=${() => form.submitting()}>Go</button>
  </form>
`, document.body);
```

`register(name)` returns an object you spread into an input: it installs the `name` attribute, a reactive `.value`, and `@input` / `@blur` handlers. Validation runs on submit by default; opt into `"blur"` or `"input"` for earlier feedback. No two-way magic — bindings only appear where you spread `register()`.

See [docs/form.md](./docs/form.md).

## Workspace layout

| Path | Contents |
| --- | --- |
| `packages/core` | `@sanify/core` — the framework |
| `packages/create-sanify` | `create-sanify` — `bun create sanify` scaffolding CLI |
| `example/` | A small showcase used as the HMR target for `bun dev` |
| `docs/` | Per-module deep-dive documentation (markdown — canonical source for the docs site) |
| `scripts/size.ts` & `scripts/bench.ts` | Bundle size + micro-benchmark scripts |
| `dev-server.ts` | Bun's dev server entry for the `example/`, with HMR |

The documentation site lives in a sibling repo (`../sanify-docs`) and consumes `@sanify/core` via a local `file:` dependency for development.

## Commands (root)

| Command | Purpose |
| --- | --- |
| `bun dev` | Run the example app at http://localhost:54712 with HMR |
| `bun test` | Run all workspace tests |
| `bun run typecheck` | Type-check every workspace member |
| `bun run build` | Build all packages into their own `dist/` |
| `bun run size` | Minify `@sanify/core` and print raw / gzip / brotli sizes |
| `bun run bench` | Micro-benchmark common operations (regression baseline) |

## Using `@sanify/core` in another project

```bash
bun add @sanify/core
```

```ts
import {
  signal, effect, computed, batch, untrack, on,
  createContext, useContext, createRoot, createOwner, runWithOwner,
  html, render, For, Show, Switch, Match, Index,
  Portal, ErrorBoundary, Suspense, Dynamic, Transition, provide,
  component,
  resource, mutation, invalidate, setResourceData, getResourceData,
  createClient, HttpError,
  router, lazy, navigate, redirect, back, forward, current, params, query,
  createStore, produce, persisted,
  createForm, schema, validators,
  createSelector, debounced, throttled,
  __debug,
} from "@sanify/core";
```

## Devtools

```ts
import { __debug } from "@sanify/core";
__debug.enable();
__debug.stats();      // { signals, effects, pendingEffects, rootOwners }
__debug.ownerTree();  // OwnerNode[] tree snapshot
```

After `enable()`, `globalThis.__sanify_debug` is set, so the browser console can run `__sanify_debug.ownerTree()` directly. Tracking is opt-in — until you enable it, the runtime cost is zero.

## Publishing to npm

`@sanify/core` must be live first, since the scaffolded template resolves it from npm.

Before publishing, **always run the gauntlet** and make sure each step is green:

```bash
bun run typecheck
bun test
bun run build       # also emits .d.ts via tsc
```

Then:

```bash
cd packages/core         && npm publish --access public
cd ../create-sanify      && npm publish --access public
```

## Deliberate technical debt

| # | Item | Notes |
| --- | --- | --- |
| 1 | Template parser is a state-aware scanner, not a full HTML parser | Quoted & multi-part attributes and `<div ${spread}>` work; literal `<`/`>` in text and holes inside tag names are not supported |
| 2 | Cross-tick component reconnect | Synchronous moves (e.g. `For` reorder) preserve state; reconnects across a microtask gap rebuild from scratch |
| 3 | Router loaders don't auto-integrate with `Suspense` | They're created at `router()` build time, before any user-level `Suspense` boundary exists. Render `Suspense` with your own `resource()` inside the component if you need a fallback |

## Out of scope: SSR

**`@sanify/core` is CSR-only by design.** There is no server-side rendering, no hydration, no streaming, and none are planned for the core package. This is a deliberate choice — same posture as [Lit](https://lit.dev) — for three reasons:

1. **Bundle hygiene.** SSR runtime code would ship to every consumer, even ones who never render on a server.
2. **Maintenance.** SSR is a parallel rendering reality that drifts away from the client path over time.
3. **Niche fit.** sanify targets apps and dashboards (Web Components + Light DOM + Tailwind). SEO and FCP-on-marketing-pages are secondary concerns for that niche.

If you need static pre-rendering for a docs/marketing page, **use a separate generator** (Astro with Web Components, an explicit static prerender script using happy-dom + `renderToString`, or hand-written HTML) and let sanify pick up the interactivity on the client. A `@sanify/ssg` package may emerge later for build-time pre-rendering if there's demand — it will be a separate package, not part of core.

Pragmatic fallback if you need SEO today: pre-render landing pages by hand as HTML and use sanify only inside an interactive island. Web Components compose this way naturally.

## License

MIT © Satria Agung Nugraha
