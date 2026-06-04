# Store

Source: `packages/core/src/store/`

Two complementary tools for state that wants more structure than a bare `signal`:

- `**createStore**` (`store/reactive.ts`) — a Proxy-backed nested store where each accessed property gets its own signal, so reading `state.user.name` only re-runs when *that* leaf changes.
- `**persisted*`* (`store/store.ts`) — a signal that mirrors itself to `localStorage` (or any `Storage`) with optional debounce and cross-tab sync.

Both are turunan signal — no new reactivity engine, just composition.

## API

### `createStore`


| Export        | Signature                                         | Purpose                                         |
| ------------- | ------------------------------------------------- | ----------------------------------------------- |
| `createStore` | `<T extends object>(initial) => [T, SetStore<T>]` | Nested reactive store                           |
| `produce`     | `<T>(fn: (draft: T) => void) => Producer<T>`      | Imperative draft mutations for `setState`       |
| `SetStore<T>` | type                                              | The setter signature: partial / path / producer |


### `persisted`


| Export              | Signature                                            | Purpose                                                    |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `persisted`         | `<T>(key, initial, opts?) => [Getter<T>, Setter<T>]` | Signal mirrored to storage                                 |
| `PersistOptions<T>` | type                                                 | `{ storage?, serialize?, deserialize?, debounce?, sync? }` |


## `createStore`

```ts
ok tate.user.age++;                            // logs nothing — different leaf
state.todos.push({ id: 1, text: "ship", done: false });
```

Reading `state.user.name` traverses two Proxies. Each access lazily creates a signal for that key on first read, so the read **subscribes** to it. Writes hit the same signal, so only effects that read this leaf re-run. Effects reading `state.user.age` are not woken up.

### Writing — prefer direct mutation

**Just assign to the proxy.** That is the idiomatic style in this codebase:

```ts
state.user.name = "Satria";                              // single leaf
state.todos[0].done = true;                              // array index
state.todos.push({ id: 2, text: "docs", done: false }); // array mutation
state.user = { name: "Replaced", age: 0 };               // replace subtree
```

The `set` trap on the proxy resolves to the same signal a read would, so updates are precise and type-safe — TypeScript checks `state.user.name = 123` immediately.

### Writing — when to reach for `setState`

`setState` is the same machinery wrapped in a function. It exists for three situations where direct assignment is awkward:

**1. Batching a burst of writes.** Direct assignments each flush on their own microtask; a path-`setState` or `produce` batches them so downstream effects run once:

```ts
setState(produce((draft) => {
  draft.user.name = "Satria";
  draft.user.age = 27;
  draft.todos.push({ id: 2, text: "ship", done: false });
})); // one flush, one effect run
```

(You can also wrap direct mutations in `batch(() => { ... })` to get the same effect — see the [Reactivity docs](./reactivity.md#batching).)

**2. Updater functions based on the previous value.**

```ts
setState("user", "age", (prev) => prev + 1);
```

The equivalent direct form is verbose but works: `state.user.age = state.user.age + 1`.

**3. Programmatic paths built from variables.**

```ts
const path = ["todos", todoIdx, "done"] as const;
setState(...path, true);
```

For the everyday case — one or two writes — direct assignment wins. Reach for `setState` only when you hit one of the three above.

### Why path-tuples instead of dot-strings

`setState("user", "name", value)` rather than `setState("user.name", value)`:

- TypeScript can infer `value`'s type at each key step (`T[K1][K2]`); a single dotted string can't.
- Array indexes work naturally (`setState("todos", 0, "done", true)`); no parsing rules for `"todos.0.done"` vs `"todos[0].done"`.
- No runtime string-split, no escape rules for keys containing `.`.

### Reactive reads

Behind the scenes:


| Read                                              | Tracked dependency                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `state.user`                                      | `user` key on root + the nested store's existence                       |
| `state.user.name`                                 | `name` key on the nested store                                          |
| `Object.keys(state)` / `"x" in state` / iteration | A separate "structure" signal that bumps when keys are added or removed |


Adding `state.newKey = 1` re-runs effects that iterated `state`, but doesn't re-run effects that read `state.user.name`.

### Lazy property signals

A property's signal is created the first time it's read — not at construction. This matters for two reasons:

1. **Cost scales with what's used**, not with object size. A store of 10 000 keys with one accessor pays for one signal.
2. **Writing a not-yet-read key still tracks structure** so iteration consumers wake up, but no extra signal is created until someone reads it.

### When to use `createStore` vs `signal`

Use a plain `signal` when the unit of change is the whole value (a counter, a current user object you replace wholesale, a list you regenerate). Use `createStore` when consumers care about individual leaves of a nested shape (forms, settings panels, todo lists you mutate in place).

## `persisted`

```ts
import { persisted } from "@sanify/core";

const [theme, setTheme] = persisted<"light" | "dark">("theme", "light", {
  sync: true,           // cross-tab synchronisation
  debounce: 200,        // wait 200ms of quiet before writing
});

setTheme("dark");       // saved to localStorage["theme"]
```

The returned tuple looks and behaves like a regular `signal` — pass it around the same way.

### Options


| Option        | Default          | Meaning                                                                                                    |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `storage`     | `localStorage`   | Any object matching the `Storage` interface (`sessionStorage`, an in-memory mock, IndexedDB wrapper, etc.) |
| `serialize`   | `JSON.stringify` | Converts the value to a string before writing                                                              |
| `deserialize` | `JSON.parse`     | Parses the stored string on init and on cross-tab events                                                   |
| `debounce`    | `0`              | Milliseconds to wait before writing; coalesces rapid updates                                               |
| `sync`        | `false`          | Subscribe to `window.storage` events to mirror updates from other tabs                                     |


### Lifecycle

1. On creation, the stored value is loaded (falling back to `initial` if the slot is missing or `deserialize` throws).
2. An effect persists every change. With `debounce > 0`, writes are coalesced via `setTimeout`.
3. With `sync: true`, the window listens for `storage` events. A write from another tab arrives as a `StorageEvent`; the value is parsed and applied locally without re-broadcasting (a `writing` guard prevents echo loops).

### Cross-tab sync

`storage` events fire in **other** tabs when one tab calls `setItem`. The current tab does not receive its own event. Combined with the `writing` guard, the data flow is:

```
Tab A: setTheme("dark") ─ write to localStorage ─→ storage event
                                                      │
Tab B: storage handler ─ deserialize ─ setValue ──────┘
```

Result: both tabs converge on the same value.

### Pitfalls


| Symptom                   | Cause                                                  | Fix                                                                          |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Value resets on reload    | `deserialize` throws on stored data                    | Provide a custom `deserialize` that handles older shapes, or migrate the key |
| Two tabs ping-pong values | A second `persisted` with the same key in the same tab | Each key should be owned by exactly one `persisted` per tab                  |
| Throws under SSR / Node   | `localStorage` doesn't exist                           | Pass a no-op `storage` shim, or only call `persisted` in browser code        |


## Choosing between `signal`, `createStore`, and `persisted`


| Question                                                      | Use                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Single value, replaced wholesale                              | `signal`                                                           |
| Tree with leaves consumers read independently                 | `createStore`                                                      |
| Value should survive reload (and optionally sync across tabs) | `persisted`                                                        |
| Tree that should also survive reload                          | `createStore` over `persisted` — mirror it to storage in an effect |


Example of the last one:

```ts
const [persistedState, setPersistedState] = persisted("app", { theme: "light" });
const [state, setState] = createStore(persistedState());
effect(() => setPersistedState(() => ({ ...state })));
```

(Keep this pattern simple; if the tree is large, prefer mirroring only the leaves you actually need to persist.)

## Mental model

> `createStore` is a Proxy that lazily creates one signal per property you read, plus one extra "structure" signal for iteration. `persisted` is a signal with an effect that writes to storage and an optional `storage` event listener for the inverse direction. Both are tiny wrappers, both compose with everything else.

