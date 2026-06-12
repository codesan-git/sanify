# Rendering

Source: `packages/core/src/rendering/`

The rendering layer turns reactive state into DOM. It has three files:

- `template.ts` — `html` tagged templates, the runtime compiler, the fine-grained binding engine, the `For` keyed list, the `TransitionGroup` animated list, plus the scope directives (`Portal`, `ErrorBoundary`, `Suspense`, `Dynamic`, `Transition`, `provide`).
- `flow.ts` — control-flow primitives (`Show`, `Switch`/`Match`, `Index`) built on top of `template.ts`.
- `component.ts` — `component(tag, setup, options?)` registers a native Web Component with auto-disposed reactive scope and HMR-friendly re-mount.

There is no virtual DOM. Each `${...}` hole in a template becomes a small effect that touches exactly one node.

## API

### Templates

| Export | Signature | Purpose |
| --- | --- | --- |
| `html` | tagged literal | Captures `{ strings, values }`; doesn't parse yet |
| `render` | `(result, container) => void` | Renders a `TemplateResult` into a DOM container |
| `For` | `(each, render, { key? }) => directive` | Keyed list with local reconciliation |
| `TransitionGroup` | `(name, each, render, options?) => directive` | Keyed list with CSS enter/leave animations per item |

### Control flow

| Export | Signature | Purpose |
| --- | --- | --- |
| `Show` | `(when, children, fallback?)` | Render `children` when `when()` is truthy |
| `Switch` / `Match` | `(cases, fallback?)` / `(when, children)` | First matching case wins |
| `Index` | `(each, render)` | Position-keyed list (item updates in place) |

### Scope directives

| Export | Signature | Purpose |
| --- | --- | --- |
| `provide` | `(ctx, value, children)` | Inject a context value for the subtree |
| `Portal` | `(target, children)` | Render `children` into a node outside the current tree |
| `ErrorBoundary` | `(fallback, children)` | Catch errors thrown during render or in effects |
| `Suspense` | `(fallback, children)` | Show `fallback` while any nested `resource()` is loading |
| `Dynamic` | `(tag, props?)` | Render an element whose tag name is decided at runtime |
| `Transition` | `(name, children, options?)` | Wrap reactive content with CSS enter/leave animations |

### Components

| Export | Signature | Purpose |
| --- | --- | --- |
| `component` | `(tag, setup, options?)` | Register a Web Component |
| `ComponentContext` | type | `{ props, el }` passed to `setup` |
| `ComponentOptions` | type | `{ attrs?, props? }` declaration of inputs |

## Templates

```ts
import { html, render } from "@sanify/core";

const view = html`
  <header class="${theme}">
    <h1>${() => title()}</h1>
    <button @click=${onClick}>${() => count()}</button>
  </header>
`;
render(view, document.body);
```

### How `html` works at runtime

1. The tagged literal returns `{ strings, values }`. Nothing is parsed yet.
2. At render time, `compile(strings)` runs **once per unique tag literal** and is cached in a `WeakMap` keyed by the `TemplateStringsArray`. The same `` html`<div>${x}</div>` `` literal across many renders shares one cached template.
3. `compile` runs a state-aware scanner over the joined string (text / in-tag / in-quote), replacing each hole with a comment marker (for text) or a placeholder attribute (for attributes). The output is parsed once by the browser via `template.innerHTML`.
4. A `TreeWalker` collects part locations (node index + attribute recipe). The result — `{ template, parts, recipes }` — is the cached blueprint.
5. Every render: `template.content.cloneNode(true)`, then walk `parts` and attach bindings to the cloned nodes.

The runtime overhead per render is one clone + N binding installs, where N is the number of `${...}` holes. There is no diffing.

### Binding rules

| Syntax | Semantics |
| --- | --- |
| `${value}` between tags | Inserted as child (text, template, array, `For`, directive) |
| `name=${value}` | Sets an attribute (always coerced to string) |
| `.name=${value}` | Sets a property on the element (useful for objects/numbers/booleans into a child component) |
| `@event=${handler}` | Adds an event listener once; the handler itself is not reactive |
| `name="static ${a} ${b}"` | Multi-part attribute; reactive if any value is a function |
| `${someBoolean}` for attributes | `true` → empty attribute; `false`/`null`/`undefined` → removed |
| `<tag ${object}>` | Spread: each key applied per its prefix (`@event`, `.prop`, plain attr); per-key value may be a function for reactive |

**Reactivity rule — the #1 source of bugs.** A binding is reactive **only if the value is a function**. Inline reads execute once and lose reactivity:

```ts
// WRONG: evaluated once during render, never updates
html`<span>${count()}</span>`

// RIGHT: wrapped in a function, re-runs whenever `count` changes
html`<span>${() => count()}</span>`
```

The same applies to attribute values: `class=${() => cls()}`, not `class=${cls()}`.

### `For` — keyed list reconciliation

```ts
For(
  () => todos(),
  (todo, index) => html`<li>${() => todo().text}</li>`,
  { key: (todo) => todo.id }, // identity → reuse DOM
);
```

The `each` getter is tracked. When the list changes, `For` matches new items to existing rows by key:

- Same key → row is reused; `item` and `index` getters update in place.
- New key → fresh row is rendered.
- Missing key → row's owner is disposed and DOM is removed.
- The result is re-ordered with the minimum number of moves.

Default key is identity (the item itself). Provide a stable `key` for primitives or to survive mutation.

`Index` is the same primitive with key by position — DOM is preserved per index slot and item changes flow through as updates. Good for lists of primitives or when ordering is stable.

### `TransitionGroup` — animated list

```ts
TransitionGroup(
  "list",
  () => todos(),
  (todo) => html`<li>${() => todo().text}</li>`,
  { key: (t) => t.id, duration: 300 },
);
```

```css
.list-enter { animation: fade-in 300ms ease; }
.list-leave { animation: fade-out 300ms ease; }
@keyframes fade-in  { from { opacity: 0; transform: translateY(-8px); } }
@keyframes fade-out { to   { opacity: 0; transform: translateY(8px); } }
```

`TransitionGroup` combines `For`-style keyed list reconciliation with CSS enter/leave animations per item. On each update:

- **New items** are inserted with class `${name}-enter`. The class is removed after `animationend`/`transitionend` (or the `duration` fallback, default 500ms).
- **Removed items** get class `${name}-leave`. After the animation finishes, their DOM is removed and their reactive scope is disposed.
- **Reordered items** are moved in the DOM (like `For`) — no animation on move (FLIP is not yet supported).
- **Respects** `prefers-reduced-motion: reduce` — all animations are skipped, making content swaps instant.

Only two CSS classes (enter/leave), same model as `Transition`. Use `@keyframes` for declarative animations.

## Control flow

```ts
Show(
  () => user(),
  (u) => html`<p>Hi, ${() => u().name}</p>`,
  () => html`<p>Please sign in</p>`,
);
```

`Show` re-renders only when truthiness changes — not on every dependency tick. The `children` callback receives a narrowed getter (`NonNullable<T>`).

```ts
Switch(
  [
    Match(() => status() === "loading", () => html`<spinner></spinner>`),
    Match(() => status() === "error", () => html`<p>error</p>`),
    Match(() => true, () => html`<data-view></data-view>`),
  ],
);
```

`Switch` re-renders only when the active case index changes.

## Scope directives

### `provide(ctx, value, children)`

Provides a context value for the subtree. The directive creates a child owner whose `context` map stores the value; consumers walk up and find it.

```ts
const Theme = createContext<"light" | "dark">("light");
provide(Theme, "dark", () => html`<app-shell></app-shell>`);
```

### `Portal(target, children)`

Renders `children` into another DOM node (e.g. `document.body`) while keeping the reactive scope attached to the surrounding tree. Useful for modals and toasts that need to escape `overflow:hidden` ancestors. Cleanup removes the portal nodes when the parent scope disposes.

### `ErrorBoundary(fallback, children)`

```ts
ErrorBoundary(
  (err, reset) => html`<p>Crashed: ${String(err)} <button @click=${reset}>retry</button></p>`,
  () => html`<risky-widget></risky-widget>`,
);
```

Errors thrown synchronously during render of `children`, or asynchronously inside any effect under the same owner chain, are caught and routed to `fallback`. Calling `reset()` clears the error state and re-renders `children`.

### `Suspense(fallback, children)`

```ts
Suspense(
  () => html`<i>loading...</i>`,
  () => html`<user-profile></user-profile>`,
);
```

`Suspense` provides a counter on its owner. Every active `resource()` inside the subtree increments while loading and decrements when done. The fallback `<div>` is toggled with `display: contents` so neither layout box affects flow when hidden. Children stay mounted underneath — their effects keep running, so multiple resources can load in parallel.

### `Transition(name, children, options?)`

```ts
Transition(
  "fade",
  () => visible() ? html`<div class="card">${() => content()}</div>` : null,
  { duration: 200 },
);
```

```css
.fade-enter { animation: fade-in 200ms ease-out; }
.fade-leave { animation: fade-out 200ms ease-out; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
```

Wraps a reactive content getter and applies two CSS classes around the swap:

- When the content changes, the **outgoing** elements get `${name}-leave`. After `animationend` / `transitionend` fires (or after `duration` ms, whichever comes first), they're removed.
- The **incoming** elements get `${name}-enter`. Same removal rule.
- The swap is **sequential** — leave finishes first, then enter starts. Rapid changes collapse: only the latest pending value is rendered after the current animation completes.
- **First mount is NOT animated** unless `options.appear: true`.

Options:

| Option | Default | Purpose |
| --- | --- | --- |
| `duration` | `500` | Fallback timeout in ms — used when no CSS animation/transition fires the end event |
| `appear` | `false` | Apply the enter animation on the first mount too |

CSS class lifecycle is deliberately simple — only two classes, no `-from` / `-active` / `-to` triplet à la Vue. Use `@keyframes` for declarative animations. Accessibility: `prefers-reduced-motion: reduce` is respected automatically — animations are skipped, content swaps instantly.

> ⚠️ The leaving and entering elements never overlap (sequential). For "in-out" parallel animations, write a small bespoke directive — Transition keeps the simpler model on purpose.

### `Dynamic(tag, props?)`

```ts
Dynamic(() => userRole() === "admin" ? "admin-panel" : "user-panel", {
  ".user": currentUser,
  "@logout": handleLogout,
  "class": "panel",
});
```

The tag is recomputed reactively. When it changes, the old element is disposed and a new one is created. `props` follow the same convention as template attributes: `@event` listeners, `.prop` properties, plain `name` attributes. Function values are reactive.

## Components

```ts
import { component, html, signal } from "@sanify/core";

component<{ count: number }>(
  "my-counter",
  ({ props }) => {
    const [local, setLocal] = signal(0);
    return () => html`
      <button @click=${() => setLocal((n) => n + 1)}>
        prop:${() => props.count()} + local:${() => local()}
      </button>
    `;
  },
  {
    attrs: { count: (raw) => Number(raw ?? 0) },
  },
);
```

```html
<my-counter count="5"></my-counter>
```

### Lifecycle

- `setup({ props, el })` runs **once** when the element connects. The returned function is the reactive view.
- All effects created during `setup` (or by reading the view) attach to an `Owner` private to this element. When the element disconnects, that owner is disposed and every effect goes with it.
- DOM moves (e.g. a keyed list reorder) trigger `disconnectedCallback` then `connectedCallback` synchronously; the component detects this and **preserves state** instead of re-mounting. Cross-tick reconnects rebuild from scratch.

### `attrs` vs `props`

| Kind | Trigger | Type |
| --- | --- | --- |
| `attrs: { name: converter }` | HTML attribute mutation | Always `string \| null` raw; converter coerces |
| `props: ["name"]` | JS property assignment | Any value; passed through as-is |

Use `attrs` for things you want to write in HTML or have observable from outside (`element.setAttribute("count", "5")`). Use `props` for objects, numbers, booleans, callbacks, or anything you'd pass with `.prop=${value}` in a template.

The `converter` field accepts a function `(raw: string | null) => T`, or one of four built-in shortcuts for common HTML attribute shapes:

| Shortcut | Behaviour | Use it for |
| --- | --- | --- |
| `"string"` | `null` when absent, raw string otherwise | Labels, IDs, plain text attributes |
| `"number"` | `NaN` when absent, `Number(raw)` otherwise | Counts, sizes, numeric props |
| `"boolean"` | `false` when absent, `true` when present (presence-based, HTML convention) | Flags like `disabled`, `active`, `open` |
| `"json"` | `null` when absent or empty, `JSON.parse(raw)` otherwise (throws if malformed) | Structured data passed via `<x-foo data='{"a":1}'>` |

```ts
component<{ count: number; active: boolean; data: { id: number } | null }>(
  "x-foo",
  setup,
  {
    attrs: {
      count: "number",
      active: "boolean",
      data: "json",
      // mix with custom converters when needed:
      // tags: (raw) => (raw ?? "").split(","),
    },
  },
);
```

Passing an unknown shortcut name throws at registration time.

Both names land on the same `props` getter map in `setup({ props })`. A property set **before** the element is upgraded (e.g. assigned in a constructor before `customElements.define` runs) is preserved and re-applied through the accessor.

### HMR

Re-calling `component(tag, newSetup)` with a tag that already exists swaps the setup function and re-mounts every live instance via an internal `__remount()`. Prop values are kept; local state inside `setup` resets.

### Light DOM (intentional)

Components render into themselves, not into a Shadow Root. This is a deliberate choice so global Tailwind classes work without any per-component plumbing. The trade-off is that styles aren't scoped — discipline at the CSS layer (Tailwind utilities or BEM) is on you.

### CSR-only by design

Rendering happens in the browser. There is **no `renderToString` / `renderToStream` / `hydrate`** in this package, and there will not be one in core. The rationale lives in the [root README](../README.md#out-of-scope-ssr). In short: SSR doubles the rendering implementation, hurts bundle size for users who don't need it, and conflicts with the Web Components + Light DOM niche this framework aims at.

If you need static pre-rendering for marketing or docs pages, generate the HTML separately (Astro + Web Components, a small `happy-dom` script, or just hand-written HTML) and let sanify attach interactivity to the parts that need it. A separate `@sanify/ssg` package may appear in the future for build-time pre-rendering, but it will not be part of core.

## Mental model

> A template is a static HTML blueprint compiled once. A binding is a small effect attached to one node. A component is a Web Component that creates one owner, runs `setup` once, and disposes the owner on disconnect. The `For`, `Show`, `Suspense`, and friends are just specialised wrappers that create their own owners and re-arrange children inside them.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Binding never updates | Hole written as `${value()}` instead of `${() => value()}` | Wrap in a function |
| Attribute is `"undefined"` literal | Passing an `undefined`/`null` to a multi-part attribute | Make the value a function; the binder coerces `null/undefined` to empty |
| Event handler fires multiple times after HMR | (Should not happen — HMR remount replaces children first) | Verify the tag was actually re-registered; otherwise file an issue |
| List rebuilds entirely on small change | Used `.map` instead of `For` | Use `For(items, render, { key })` |
| Custom element flashes on connect/disconnect inside keyed list | Tab switch or window blur paused the microtask queue | Microtask reconnect window is intentional; cross-tick reconnects rebuild from scratch |
