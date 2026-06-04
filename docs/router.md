# Router

Source: `packages/core/src/router/router.ts`

A client-side router with nested layouts, route params, query strings, navigation guards, per-route data loaders, and lazy-loaded routes. It plugs into the History API and intercepts clicks on `<a data-link>` links.

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `router` | `(routes, options?) => Getter<TemplateResult>` | Compile a route table; returns the reactive view |
| `lazy` | `(loader, tag, fallback?)` | Code-split a route via dynamic import |
| `navigate` | `(to) => void` | Push a new entry to history |
| `redirect` | `(to) => void` | Replace the current entry in history |
| `back` / `forward` | `() => void` | Move through the history stack |
| `current` | `Getter<string>` | Current pathname (reactive) |
| `params` | `() => RouteParams` | Path params of the current match (reactive) |
| `query` | `() => URLSearchParams` | Query string of the current URL (reactive) |
| `RouteParams` | type | `Record<string, string>` |
| `RouteConfig` | type | `{ layout?, component?, children?, guard?, loader? }` |

## A minimal router

```ts
import { router, html, render } from "@sanify/core";

const view = router({
  "/": () => html`<home-page></home-page>`,
  "/about": () => html`<about-page></about-page>`,
  "*": () => html`<not-found></not-found>`, // optional fallback
});

render(html`<main>${view}</main>`, document.body);
```

A route entry is either:

- a **handler** `(ctx) => TemplateResult` — leaf
- a **`RouteConfig`** `{ layout, component, children, guard, loader }`

`*` is a special key for the 404 fallback. If absent, the router renders `<div>404</div>`.

## `ctx` — the route context

```ts
interface RouteContext {
  params: () => RouteParams;
  outlet: () => TemplateResult;
  data: () => unknown;
}
```

| Field | Use |
| --- | --- |
| `params()` | Path params of the active route (e.g. `{ id: "42" }` for `/user/:id`) |
| `outlet()` | The child route's rendered output (only meaningful inside a layout) |
| `data()` | Resolved value from the route's `loader`, if any (see below) |

`params()` and `query()` are also exported standalone for code that doesn't have a `ctx` handy.

## Dynamic segments

```ts
router({
  "/user/:id": (ctx) => html`<p>${() => ctx.params().id}</p>`,
});
```

Each `:name` segment captures any non-`/` characters into `params().name`. Patterns are compiled to regexes; matching is exact (anchored).

`params()` is reactive. Navigating from `/user/1` to `/user/2` triggers any effect that read `params().id` — no remount of the route component.

## Nested routes and layouts

```ts
router({
  "/dashboard": {
    layout: (ctx) => html`
      <aside>menu</aside>
      <section>${ctx.outlet}</section>
    `,
    children: {
      "/":           () => html`<overview></overview>`,
      "/users":      () => html`<users-list></users-list>`,
      "/users/:id":  (ctx) => html`<user-detail id=${() => ctx.params().id}></user-detail>`,
    },
  },
});
```

How it works:

- Routes are flattened into chains — `[layout, child]`, `[layout, /users layout, child]`, etc.
- Layout nodes are **reference-shared** across their children at compile time, so navigating between siblings doesn't notify the layout level. The aside in the example stays mounted.
- `outlet` is `ctx.outlet`, the level-N+1 view. It's reactive, so changing the inner route updates the outlet without touching the parent.

This is what `For` does for lists, but for the route tree: minimum DOM disruption.

## Guards

```ts
router({
  "/admin": {
    guard: (params) => (authed() ? undefined : "/login"),
    component: () => html`<admin-panel></admin-panel>`,
  },
});
```

- Returning a string redirects to that path.
- Returning `undefined` / `void` lets the route render.
- Guards run on **every level** of the matched chain in order; the first redirect wins.
- The redirect is scheduled in a microtask so it doesn't write to a signal during a `computed` evaluation.

Guards are reactive too — if they read a signal (`authed()` here) the route re-evaluates when that signal changes. Sign-in flips `authed` to true → `/admin` immediately passes the guard.

## Loaders

```ts
router({
  "/users/:id": {
    loader: async ({ id }) => fetch(`/api/users/${id}`).then((r) => r.json()),
    component: (ctx) => html`
      <user-detail .user=${() => ctx.data()}></user-detail>
    `,
  },
});
```

When a route with a `loader` matches, the router calls the loader and exposes its result through `ctx.data()`. The first render's `data()` returns `undefined` until the promise resolves.

Caching follows the resource convention: the cache key is `nodeId:JSON.stringify(params())`.

- Navigating `/users/1` → `/users/2` refetches (params changed).
- Navigating back to `/users/1` is **instant** (cache hit).
- Layout-level loaders share their cache across all child routes (the layout node is reference-shared), so the layout's data persists while you navigate between sibling children.

You can attach a `loader` at any level:

```ts
{
  "/team": {
    loader: () => fetchTeam(),       // layout-level data
    layout: (ctx) => html`<nav>${() => ctx.data()?.name}</nav>${ctx.outlet}`,
    children: {
      "/members": {
        loader: () => fetchMembers(), // leaf-level data
        component: (ctx) => html`<member-list .data=${() => ctx.data()}></member-list>`,
      },
    },
  },
}
```

Each level has its own `ctx.data` — they don't shadow each other.

> ⚠️ Route loaders do **not** auto-integrate with `Suspense`. The resource powering each level is created at `router()` build time, before any `Suspense` boundary in the user tree is in scope. If you need a loading fallback, render `Suspense` with your own `resource()` inside the component.

## Lazy routes

```ts
import { lazy } from "@sanify/core";

router({
  "/admin": lazy(
    () => import("./admin/index.ts"), // module that calls component("admin-page", ...)
    "admin-page",                      // the custom element tag it registers
    () => html`<spinner></spinner>`,   // optional fallback during load
  ),
});
```

`lazy(loader, tag, fallback?)` wraps a route in `Suspense` + `resource` + `Dynamic`:

1. `resource(loader)` is created — Suspense increments while the dynamic import runs.
2. Once the module resolves, `Dynamic` swaps the placeholder for `<tag>`.
3. The module must register the custom element when it executes (i.e. its top level should call `component(tag, setup, options)`).

## Navigation API

```ts
navigate("/users/7");      // pushState — new history entry
redirect("/login");        // replaceState — replaces current entry, used by guards
back();                    // history.back()
forward();                 // history.forward()
```

All four call into the History API and update the internal `current` signal so reactive consumers see the change immediately.

## Link interception

A click on `<a data-link>` is intercepted and routed through `navigate()` instead of triggering a full page load. Skipped scenarios:

| Condition | Why |
| --- | --- |
| `e.defaultPrevented` | Something else already handled it |
| `button !== 0` | Right/middle click |
| `metaKey \|\| ctrlKey \|\| shiftKey \|\| altKey` | New tab / window |
| `a.target` is not `_self` / unset | Targeted at another frame |
| `a.hasAttribute("download")` | File download |
| Cross-origin link | Outside the SPA |

To **opt out** of interception, omit `data-link` or set `target="_blank"`.

## Scroll restoration (opt-in)

```ts
router(routes, { scrollRestoration: true });
```

Browser scroll restoration doesn't always work for SPAs because navigation doesn't reload the page. When opted in:

- `history.scrollRestoration` is set to `"manual"` so the browser stops fighting you.
- Before each `navigate()`, the current `window.scrollY` is written into `history.state` of the entry you're leaving.
- After `navigate()`, the page scrolls to `(0, 0)` — the standard SPA "new page = top" behaviour.
- On `popstate` (back/forward), the saved scroll position is restored on the next microtask, after the route has re-rendered.

> ⚠️ Restore happens one microtask after popstate. If the route renders async content (image loads, lazy components, loaders), the page height at scroll time may be smaller than the target — the browser caps the scroll and the user ends up not where they were. For routes with heavy async content, call `window.scrollTo(0, y)` again after your content settles.

## `current`, `params`, `query`

```ts
import { current, params, query } from "@sanify/core";

effect(() => console.log("path:", current()));
effect(() => console.log("id:", params().id));
effect(() => console.log("q:", query().get("q")));
```

All three are reactive: `current` is the underlying path signal, `params` is computed from `current`, and `query` reads the search part of the URL.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Layout flashes when child route changes | A non-shared layout (or a stale build) | Ensure the layout is declared once at the parent level with `children` |
| `params()` returns `{}` outside `router(...)` | No active flat patterns | `params()` reads the most recently compiled router — declare the router once at app start |
| Lazy fallback never disappears | Module loader didn't actually register the `tag` | Verify the dynamic import calls `component(tag, …)` at top level |
| Guard fires repeatedly during navigation | Guard reads signals that change with the params | Inevitable — guards are reactive by design; keep them cheap |
| Loader fires twice for the same path | Two distinct routes match by accident | Tighten the patterns or add a more specific entry |
| `data()` is `undefined` after navigation | Loader is async; first render fires before the fetch resolves | Use `Show(() => ctx.data(), …, () => …loading…)` or your own `Suspense` |

## Mental model

> The router is a `computed` over `current()` that yields a chain of route nodes. Each level renders inside its own reactive boundary so siblings can change without bothering parents. `loader` is just a `resource` keyed by node identity + params. `lazy` is just `resource` + `Dynamic` + `Suspense`. There is no special "router runtime" — it's signals all the way down.
