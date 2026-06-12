# @sanify/core

[![npm version](https://img.shields.io/npm/v/@sanify/core.svg?color=fb923c)](https://www.npmjs.com/package/@sanify/core)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@sanify/core?label=min%2Bgzip&color=fb923c)](https://bundlephobia.com/package/@sanify/core)
[![license](https://img.shields.io/npm/l/@sanify/core?color=fb923c)](https://github.com/codesan-git/sanify/blob/main/LICENSE)

The core of **Sanify Frontend**: a fine-grained reactive framework on top of native Web Components. Solid-style signals, Light DOM (Tailwind-friendly), no virtual DOM, no global diffing. **~10 KB gzipped**, **CSR-only by design**.

> Built to scratch a specific itch: Solid-style fine-grained reactivity on top of native Web Components, with Light DOM so Tailwind just works, no virtual DOM, no build step required. It's everything I'd actually use to ship a small SPA fast — signals, store, router, resource, mutation, HTTP client, forms — wrapped in ~10 KB. Not trying to replace anything; just what I reach for personally.

## Installation

```bash
bun add @sanify/core
```

## Usage

```ts
import { component, html, signal } from "@sanify/core";

component("hello-counter", () => {
  const [count, setCount] = signal(0);
  return () => html`
    <button @click=${() => setCount((n) => n + 1)}>
      Clicks: ${() => count()}
    </button>
  `;
});
```

```html
<hello-counter></hello-counter>
```

Quick start a project: `bun create sanify my-app`.

## API

| Group | Exports |
| --- | --- |
| **Reactivity** | `signal`, `effect`, `computed`, `batch`, `untrack`, `on`, `onCleanup`, `onMount`, `createRoot`, `createOwner`, `runWithOwner`, `Owner` |
| **Helpers** | `createSelector`, `debounced`, `throttled` |
| **Context** | `createContext`, `useContext`, `provide` |
| **Template** | `html`, `render`, `For` (keyed list with DOM reuse), `TransitionGroup` (animated list) |
| **Control-flow** | `Show`, `Switch`/`Match`, `Index`, `Dynamic`, `Transition` (enter/leave CSS), `TransitionGroup` (list animation), `Portal`, `ErrorBoundary`, `Suspense` |
| **Component** | `component` (Web Component + HMR + reconnect-tolerant) |
| **Store** | `createStore` + `produce` (Proxy-backed nested, fine-grained per leaf), `persisted` (localStorage + cross-tab sync) |
| **Form** | `createForm` (field-level + async validation), `schema`, `validators` (`v.string`, `v.email`, `v.number`, `v.boolean`, `v.custom`) |
| **Router** | `router` (nested, layout, guard, loader, scroll restoration), `lazy`, `navigate`, `redirect`, `back`, `forward`, `current`, `params`, `query` |
| **Resource (read)** | `resource` (reactive fetch + cache + dedupe + SWR + AbortController + GC), `invalidate`, `setResourceData`, `getResourceData` |
| **Resource (write)** | `mutation` (loading/error/data + auto-invalidate) |
| **HTTP client** | `createClient` (baseUrl + headers + before/after interceptors), `HttpError` |
| **Devtools** | `__debug` (opt-in: stats + owner tree, exposed on `globalThis.__sanify_debug`) |

## Template rules

The #1 source of bugs:

- **Reactive bindings must be functions**: `${() => count()}`, not `${count()}` — the latter evaluates once and loses reactivity.
- `name=${value}` → attribute (coerced to string).
- `.name=${value}` → property (objects/numbers/booleans into a child component).
- `@event=${handler}` → event listener.
- `<tag ${object}>` → **spread**: each key applied per its prefix.
- Observed attributes need a converter — either a function `(raw) => T` or a **shortcut**:

  ```ts
  component<{ count: number; active: boolean; data: { id: number } | null }>(
    "x-foo",
    setup,
    {
      attrs: {
        count: "number",  // shortcut: NaN when absent, Number(raw) otherwise
        active: "boolean", // presence-based (HTML convention)
        data: "json",      // null when absent/empty, JSON.parse otherwise
        // or use a function for custom logic: tags: (raw) => raw?.split(",") ?? []
      },
    },
  );
  ```

## Deeper docs

Full per-module deep-dives live in the repo:

| Module | Doc |
| --- | --- |
| Reactivity (signals, owners, context, helpers, debug) | [docs/reactivity.md](https://github.com/codesan-git/sanify/blob/main/docs/reactivity.md) |
| Rendering (templates, control-flow, components) | [docs/rendering.md](https://github.com/codesan-git/sanify/blob/main/docs/rendering.md) |
| Store (createStore, persisted) | [docs/store.md](https://github.com/codesan-git/sanify/blob/main/docs/store.md) |
| Form (createForm, validators) | [docs/form.md](https://github.com/codesan-git/sanify/blob/main/docs/form.md) |
| Router (nested, guards, loaders, scroll) | [docs/router.md](https://github.com/codesan-git/sanify/blob/main/docs/router.md) |
| Resource (read, write, client, interceptors) | [docs/resource.md](https://github.com/codesan-git/sanify/blob/main/docs/resource.md) |

## CSR-only by design

This package does not include SSR, hydration, or streaming, and none are planned for the core. Same posture as Lit. For static pre-rendering, use a separate generator (Astro + Web Components, a small `happy-dom` script) and let sanify attach interactivity on the client.

## License

MIT © Satria Agung Nugraha
