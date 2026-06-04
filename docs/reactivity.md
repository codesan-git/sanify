# Reactivity

Source: `packages/core/src/reactivity/`

The reactivity layer is the foundation everything else stands on. Templates, components, stores, the router, and resources are all just consumers of the primitives below. The model is Solid-style fine-grained: a signal is a tiny pub/sub cell, an effect subscribes to whichever signals it reads, and the dependency graph is rebuilt every time the effect runs. There is no virtual DOM and no global diffing.

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `signal` | `<T>(initial: T) => [Getter<T>, Setter<T>]` | Reactive cell with `Object.is` change guard |
| `effect` | `(fn) => () => void` | Re-runs `fn` whenever any signal read during its last run changes |
| `computed` | `<T>(fn) => Getter<T>` | Memoised derived signal |
| `batch` | `<T>(fn) => T` | Group `set()` calls; effects flush synchronously at the end |
| `untrack` | `<T>(fn) => T` | Read signals without subscribing |
| `on` | `(deps, fn, { defer? })` | Explicit dependency list; `fn` runs untracked with `(value, prev)` |
| `onCleanup` | `(fn) => void` | Cleanup hook for the active effect/owner |
| `onMount` | `(fn) => void` | Run once on the next microtask; skipped if owner already disposed |
| `createRoot` | `(fn) => T` | Detached reactive scope with manual `dispose` |
| `createOwner` / `runWithOwner` / `getOwner` | — | Build and switch reactive scopes manually |
| `createContext` / `useContext` | — | Dependency injection along the owner chain |
| `Owner` | class | Holds disposers, context, error handler, optional children (debug) |
| `__debug` | namespace | Opt-in introspection (see [Devtools](#devtools)) |

Helpers (`reactivity/helpers.ts`):

| Export | Signature | Purpose |
| --- | --- | --- |
| `createSelector` | `<T>(source, equals?)` → `(key) => boolean` | Per-key memo; consumers re-run only when their key flips |
| `debounced` | `<T>(source, ms)` → `Getter<T>` | Emits last value after `ms` of quiet |
| `throttled` | `<T>(source, ms)` → `Getter<T>` | Leading edge + trailing tail |

## Signal

```ts
import { signal, effect } from "@sanify/core";

const [count, setCount] = signal(0);
effect(() => console.log("count:", count())); // logs "count: 0"
setCount(1);                                    // logs "count: 1" on next microtask
setCount((prev) => prev + 1);                   // logs "count: 2"
```

- The getter subscribes the current observer (effect or computed) to the signal.
- The setter accepts a value or a `(prev) => next` updater.
- Updates are skipped if `Object.is(prev, next)` — useful for primitives, but means mutating an object in place won't notify. Replace the reference instead, or use `createStore` for nested objects (see [Store](./store.md)).

## Effect

```ts
effect(() => {
  const value = source();
  console.log(value);
  return () => console.log("cleanup", value); // optional cleanup
});
```

- Runs once eagerly when created.
- Re-runs whenever any signal read during the previous run changes.
- Dependencies are **dynamic**: if `cond() ? a() : b()` switches branches, the previous branch is unsubscribed automatically.
- Returning a function from the body registers it as cleanup — it runs before the next re-execution and on disposal.

The returned value is a dispose function. If an `Owner` is active, the effect is attached to it and will also die when the owner is disposed.

## Computed

A `computed(fn)` is a memoised derivation backed by a signal under the hood. It re-evaluates only when its dependencies change, and consumers compare by `Object.is`, so a computed that returns the same value won't wake downstream effects.

```ts
const [n, setN] = signal(0);
const doubled = computed(() => n() * 2);
effect(() => console.log(doubled())); // logs 0, then 2 when setN(1)
```

## Batching

`set()` schedules effects via `queueMicrotask` — DOM updates are asynchronous (React-style). Multiple `set()`s within the same tick are deduplicated.

```ts
batch(() => {
  setA(1);
  setB(2);
});
// effects depending on a() or b() run ONCE after the block, not twice.
```

In tests, calling `batch(() => {})` is a convenient way to force a synchronous flush before assertions.

## Untrack

```ts
effect(() => {
  const a = tracked();
  const b = untrack(() => other()); // not a dependency
  console.log(a, b);
});
```

`untrack` reads the latest value without subscribing — handy when you want to use a signal as a parameter without tying re-runs to it.

## `on`: explicit dependencies

```ts
effect(on(
  () => userId(),
  (id, prev) => {
    fetchUser(id);   // runs untracked — fetchUser internals don't add deps
    return () => abort();
  },
  { defer: true }, // optional: skip the first run, wait for the first change
));
```

`on` is useful when the body would otherwise track signals you don't want to depend on (e.g., calling helpers that read other signals).

## Owner / scope

`Owner` is the lifetime container for effects. Every effect created with an active `currentOwner` is attached to it. When the owner is disposed, all attached effects and their cleanups run.

```ts
const owner = createOwner();
runWithOwner(owner, () => {
  effect(() => /* ... */);
});
// ... later
owner.dispose(); // tears down the effect above
```

`createRoot(dispose => …)` is the convenience form: it creates an owner, runs your callback inside it, and hands you the dispose function. This is the standard way to spin up a reactive scope outside of a component (tests, ad-hoc subscriptions).

Owners also chain:

- `Owner.parent` points at the enclosing owner (set from `currentOwner` at construction).
- `provide(...)` / `Suspense(...)` / `ErrorBoundary(...)` store data on the owner; consumers walk the parent chain to find it.

## Context

Solid-style dependency injection through the owner chain.

```ts
const ThemeCtx = createContext<"light" | "dark">("light");

// provider — see rendering docs for the `provide` directive
provide(ThemeCtx, "dark", () => html`<my-app></my-app>`);

// consumer (must run inside the provider's subtree)
const theme = useContext(ThemeCtx);
```

`useContext` walks `currentOwner.parent` chain until it finds the matching key, falling back to the context's default value. Because owners persist across renders inside a Suspense/Portal/ErrorBoundary boundary, context survives re-renders.

## Helpers

### `createSelector`

```ts
const isSelected = createSelector(() => selectedId());

For(items, (item) => html`
  <li class=${() => (isSelected(item().id) ? "active" : "")}>...</li>
`, { key: (it) => it.id });
```

When `selectedId()` flips from `a` to `b`, only the consumers reading `isSelected("a")` and `isSelected("b")` re-run. The other items in the list are untouched. For a 10 000-row list with one selected row, that's two effect runs instead of ten thousand.

### `debounced`

```ts
const [query, setQuery] = signal("");
const debouncedQuery = debounced(query, 250);

effect(() => fetchSearch(debouncedQuery())); // only fires 250ms after typing stops
```

### `throttled`

```ts
const throttledScroll = throttled(scrollY, 16); // ~60fps
```

Leading edge + trailing: the first value passes through immediately, then at most one update per `ms`, with the last value emitted at the end of the window.

## Devtools

`__debug` is opt-in — it costs nothing until enabled.

```ts
import { __debug } from "@sanify/core";

__debug.enable();                  // installs globalThis.__sanify_debug too
__debug.stats();                   // { signals, effects, pendingEffects, rootOwners }
__debug.ownerTree();               // OwnerNode[] tree snapshot
```

After enabling, every new signal/effect/owner increments counters, and owners track their children for tree introspection. Old data created before enabling is not retroactively counted; call `enable()` early.

In the browser dev console, `window.__sanify_debug.ownerTree()` is the fastest way to spot a runaway subtree or a leaked owner.

## Error handling guarantees

The reactive layer routes errors through the owner chain so an `ErrorBoundary` somewhere up the tree can catch them. Specifically:

| Site | Behaviour |
| --- | --- |
| Throw inside `effect(fn)` body | Caught; routed to nearest `errorHandler` via the owner chain (`findErrorHandler`). No handler → re-thrown out of the effect run |
| Throw inside `onMount(fn)` body | Same as effect — routed to nearest `errorHandler` on a microtask. No handler → re-thrown to the global unhandled-rejection path |
| Throw inside an `effect` cleanup | **Isolated** — the throwing cleanup is logged via `console.error`, then the next cleanup runs. The chain is never aborted partway through |
| Throw inside an `Owner` disposer | **Isolated** the same way — sibling effects and child owners still get disposed |
| Throw inside an event handler (`@click=${...}`) | **Not** caught by the framework — event listeners run outside the reactive call stack. Wrap with your own `try/catch` |
| Throw in a detached promise (`setTimeout`, raw `fetch().then`) | **Not** caught — no owner is on the stack. Use `resource()` (which routes errors to `resource.error()`) or catch yourself |

The isolation of cleanup and disposer chains is deliberately defensive: a single buggy cleanup must not strand unrelated listeners or timers. The trade-off is that thrown errors during teardown surface as `console.error` rather than reaching an `ErrorBoundary` — routing into the boundary while we're still tearing it down would be re-entrant and worse than logging.

For app-wide error visibility, install a root `ErrorBoundary` plus `window.addEventListener("error", ...)` and `window.addEventListener("unhandledrejection", ...)` listeners. See [docs/rendering.md](./rendering.md#errorboundaryfallback-children) for the boundary directive.

## Mental model

> A signal is a getter that registers your effect as a subscriber. An effect is a function that gets re-run when any of its registered subscribers' signal changes. Everything else — components, templates, stores, the router — is just plumbing that builds graphs of these two things and attaches lifetimes (owners) so they can be torn down later.

Keep that picture in mind and the rest of the framework is obvious.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| Effect doesn't re-run after `set()` | Read happened outside the tracked function (e.g. inside `setTimeout`) | Re-read the signal inside the effect body, or use `on()` |
| Effect re-runs forever | Effect writes a signal it also reads, without an equality guard | Use `computed` for derivations; never `set()` a tracked signal inside its own effect |
| Cleanup runs but state lingers | `effect(fn)` returned a non-function value historically caused crashes — fixed; only function returns are treated as cleanup | n/a |
| Context returns default value | Consumer ran outside the provider's subtree, or in a fresh `createRoot` | Run `useContext` inside the owner chain that contains `provide` |
