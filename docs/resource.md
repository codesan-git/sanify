# Resource

Source: `packages/core/src/resource/`

This module covers everything fetch-related: reads (`resource`), writes (`mutation`), the shared cache and its helpers (`invalidate`, `setResourceData`, `getResourceData`), and an opinionated-but-thin `fetch` wrapper with interceptors (`createClient`).

All four pieces compose. Typical setup:

```ts
import { createClient, resource, mutation, invalidate } from "@sanify/core";

const api = createClient({
  baseUrl: "/api",
  headers: () => ({ Authorization: `Bearer ${token()}` }),
});

const users = resource((signal) => api.get<User[]>("/users", { signal }),
  { key: "users:list" });

const create = mutation((data: NewUser) => api.post<User>("/users", data),
  { invalidates: ["users:list"] });
```

## Reads — `resource`

A resource turns an async fetcher into reactive `data` / `loading` / `error` signals, with optional shared cache, in-flight deduplication, and `AbortController` integration. It hooks into `Suspense` so a fallback covers any pending fetches in a subtree.

### API

| Export | Signature | Purpose |
| --- | --- | --- |
| `resource` | `<T>((signal) => Promise<T>, options?) => Resource<T>` | Reactive fetch with cache + abort |
| `invalidate` | `(matcher?) => void` | Drop cache: `undefined` = all, string/number = exact, function = matcher |
| `setResourceData` | `<T>(key, data \| updater) => void` | Write to cache directly (optimistic updates) |
| `getResourceData` | `<T>(key) => T \| undefined` | Read cache outside of a resource (not reactive) |
| `Resource<T>` | type | `{ data, loading, error, refetch }` |
| `ResourceOptions<T>` | type | `{ key?, initial?, staleTime?, refreshOnFocus?, gcTime? }` |

## Basic usage

```ts
import { resource } from "@sanify/core";

const user = resource(() => fetch("/api/me").then((r) => r.json()));

// in a component:
return () => html`
  ${Show(
    () => user.loading(),
    () => html`<spinner></spinner>`,
    () => html`<p>${() => user.data()?.name ?? "anon"}</p>`,
  )}
`;
```

- `data()` is `undefined` until the first fetch resolves (or whatever `initial` is set to).
- `loading()` toggles around each fetch.
- `error()` holds the rejection — *not* cached.
- `refetch()` forces a new fetch ignoring the cache.

The fetcher runs **inside an effect**, so any signal read inside it becomes a dependency. Change a tracked signal and the fetcher re-runs automatically.

## Cache and dedupe (`key`)

Set `key` to opt into a module-global cache (`Map<string, CacheEntry>`):

```ts
const user = resource(
  () => fetch(`/api/users/${id()}`).then((r) => r.json()),
  { key: () => `user:${id()}` },
);
```

Behaviour:

| Situation | Result |
| --- | --- |
| Same `key` already resolved | `data()` is set synchronously from cache; no fetch |
| Same `key` already in flight | The new caller subscribes to the existing `Promise` (one network request, many consumers) |
| New `key` | A fresh fetch is kicked off and cached under the key |
| `key` changes | Same lookup logic on the new key — refetch if needed |
| Fetcher rejects | Entry is removed; next access retries |

`key` can be a static string/number, or a getter that returns one. Using a getter makes the cache lookup reactive — the effect re-runs whenever the key changes.

### Disabled state (`key` → `undefined`)

When `options.key` is provided but the getter returns `undefined`, the resource resets to `initial` (or `undefined`) and does **not** fetch. Useful for routes or conditional UIs where the resource shouldn't run yet:

```ts
const profile = resource(
  () => fetch(`/api/users/${userId()}`).then((r) => r.json()),
  {
    key: () => (loggedIn() ? `user:${userId()}` : undefined),
    initial: null,
  },
);
```

When `loggedIn()` flips to `false`, `profile.data()` returns `null` and nothing is fetched.

### Staleness (`staleTime`)

By default a cache entry lives until you call `invalidate()` or the page reloads. Setting `staleTime` opts into stale-while-revalidate:

```ts
const user = resource(
  () => fetch(`/api/users/${id()}`).then((r) => r.json()),
  { key: () => `user:${id()}`, staleTime: 30_000 }, // 30s
);
```

Behaviour when a cache hit lands on a stale entry:

- `data()` returns the stale value **synchronously** (no UI flash).
- `loading()` stays `false`.
- A background refresh fetches in the same tick; when it resolves, `data()` updates.
- If the background refresh fails, the stale data is kept and the error is silently swallowed (the assumption being: stale data is still useful, and a thrown background error would replace good data with nothing).

> ⚠️ Shared cache, per-resource signals. If two resource instances share a key and one triggers a background refresh, only **its own** `data()` is updated. Other instances will see the new value the next time their effect re-runs. The common single-consumer pattern (one resource per route or component) is unaffected.

### Garbage collection (`gcTime`)

By default cache entries live forever (until you call `invalidate()` or the page reloads). For long-running apps with many ephemeral keys (search results, paginated lists, infinite scrolls keyed by cursor), set `gcTime` to evict entries automatically after they're no longer needed:

```ts
const search = resource(
  (signal) => api.get(`/search?q=${q()}`, { signal }),
  { key: () => `search:${q()}`, gcTime: 5 * 60_000 }, // 5 minutes
);
```

Semantics: each cache entry tracks a **subscriber count** (one per active resource on that key). When the count drops to 0 (last resource unmounted), a timer of `gcTime` ms is started. If a new subscriber arrives before the timer fires, the timer is cancelled. Otherwise the entry and its version signal are evicted.

| Situation | Outcome |
| --- | --- |
| Active subscribers > 0 | Never evicted |
| Last subscriber leaves, gcTime elapses, no new sub | Entry deleted from cache |
| New resource on same key within gcTime window | Cache hit — entry reused, timer cancelled |
| Key reactive and changes | Old key unsubscribed (may schedule eviction), new key subscribed |

If multiple resources share a key with different `gcTime`, the **most recently set** value wins. Resources without a `gcTime` option don't change the entry's gcTime — they accept whatever the entry already has.

The default `gcTime` is `Infinity` (never GC), preserving the original "cache forever" behaviour. Opt into a finite value per resource that has many possible keys.

### Focus refresh (`refreshOnFocus`)

```ts
resource(fetcher, { key: "...", refreshOnFocus: true });
```

When the browser window regains focus, the resource forces a refetch (same as calling `refetch()`). The listener is attached at resource construction and removed when the surrounding scope disposes. No effect outside a browser (e.g. SSR / tests without `window`).

Combine with `staleTime` if you want focus refresh gated on staleness — implement it in user code by checking your own timestamp, or just let the refetch happen and rely on dedupe to coalesce identical requests in-flight.

### Invalidation

```ts
import { invalidate } from "@sanify/core";

invalidate();                              // drop all
invalidate("user:42");                     // exact key
invalidate((key) => key.startsWith("user:")); // matcher function — bulk drop
```

When a cache entry is dropped, **live resources subscribed to that key automatically refetch** on the next microtask. There is no need to call `.refetch()` manually after `invalidate()` — that's what the per-key version signal (described below) is for. The `refetch()` method exists for cases where you want to force a refetch *without* dropping the cache (e.g. retry after a failure).

### Optimistic updates (`setResourceData`)

```ts
import { setResourceData, getResourceData } from "@sanify/core";

setResourceData("user:42", { name: "Updated" });             // write directly
setResourceData<User[]>("users:list", (prev) =>              // updater fn
  prev ? [...prev, newUser] : [newUser],
);

getResourceData<User>("user:42"); // read without subscribing (not reactive)
```

`setResourceData` writes the cache and bumps the version signal — any resource currently subscribed to that key receives the new value reactively. Useful right after a mutation to give the UI an immediate, optimistic update; if the server-side write later differs, your next `refetch()` reconciles.

### Cross-resource reactivity (the version signal)

Each cache key has an internal `signal` that's bumped on every cache write (fetch resolve, `setResourceData`, `invalidate`). Resources subscribe to it when they read the cache. This means:

- Two resources sharing a key stay in sync — when one writes, the other re-runs.
- After `invalidate(key)`, any subscribed resource refetches automatically.
- After `setResourceData`, subscribers see the new data without manual refetch.

This is the foundation that makes optimistic updates and cross-component sharing work without manual orchestration.

## Suspense integration

```ts
Suspense(
  () => html`<spinner></spinner>`,
  () => html`<user-card></user-card>`, // contains a resource() inside setup
);
```

Each `resource()` calls `useSuspense()` at construction time, finding the nearest enclosing `Suspense` along the owner chain. While a fetch is in flight, it increments the boundary's pending counter; on settle, it decrements. The fallback is shown whenever the counter is greater than zero.

Multiple resources inside one `Suspense` all contribute to the same counter — the fallback stays up until they all settle. This is the correct behaviour for waterfalls and parallel fetches alike.

> ⚠️ The look-up happens **once** when `resource()` is created. If you build a resource outside a Suspense boundary (e.g. at module top level) it won't be tracked even if a Suspense is later mounted around it. Build resources inside the component / scope that owns them.

## Reactive dependencies

```ts
const [page, setPage] = signal(1);

const items = resource(
  () => fetch(`/api/items?page=${page()}`).then((r) => r.json()),
  { key: () => `items:${page()}` },
);

setPage(2); // items.loading() → true on next microtask; data updates after fetch
```

Two equivalent ways to make the fetcher react:

1. Read the signal inside the fetcher — the surrounding effect tracks it.
2. Use the `key` getter — same dependency tracking, plus you opt into caching.

Use `key` whenever you want navigation back to a previous state to be instant.

## Race protection

Each `load()` call increments an internal `runId`. When a promise settles, it only writes `data`/`error` if its `runId` is still the latest. This prevents an earlier slow response from overwriting a newer one.

## AbortController

The fetcher receives an `AbortSignal` as its only argument. Pass it through to `fetch` (or any abortable API) so the framework can cancel stale requests:

```ts
const items = resource(
  (signal) => fetch(`/api/items?q=${q()}`, { signal }).then((r) => r.json()),
  { key: () => q() },
);
```

When the resource cancels a fetch:

| Trigger | Behaviour |
| --- | --- |
| `key` changes (user types in search box) | Previous fetch aborted, new fetch started |
| `key()` returns `undefined` | Current fetch aborted, data resets to `initial` |
| Surrounding scope disposes (route nav, component unmount) | Current fetch aborted via `onCleanup` |
| `refetch()` called | Previous fetch aborted, new fetch started |

`AbortError` from the cancelled fetch is silently swallowed — it's not a real error, just a superseded request. If your fetcher ignores the `signal` argument (e.g. you didn't update old code), nothing breaks; the framework simply can't cancel the network call, but `runId` race protection still prevents data corruption.

## Writes — `mutation`

`mutation` is the write-side counterpart to `resource`. It tracks `loading` / `error` / `data` signals around a function call, and optionally invalidates cache keys after success.

### API

| Export | Signature | Purpose |
| --- | --- | --- |
| `mutation` | `<I, O>((input: I) => Promise<O>, options?) => Mutation<I, O>` | Wrap a write fn with loading/error/data + invalidation |
| `Mutation<I, O>` | type | `{ mutate, loading, error, data, reset }` |
| `MutationOptions<I, O>` | type | `{ invalidates?, onSuccess?, onError? }` |

### Usage

```ts
import { createForm, mutation, invalidate } from "@sanify/core";

const create = mutation(
  (input: NewUser) => api.post<User>("/users", input),
  {
    invalidates: ["users:list"],                          // refetch the list
    // invalidates: (data) => [`user:${data.id}`, "users:list"], // dynamic
    onSuccess: (data) => navigate(`/users/${data.id}`),
    onError: (err) => console.error("create failed", err),
  },
);

// In a form:
const form = createForm({
  initialValues: { name: "" },
  onSubmit: async (values) => {
    try {
      await create.mutate(values);
    } catch {
      // error already in create.error()
      form.errors._submit = (create.error() as Error).message;
    }
  },
});

// In a button:
html`<button
  disabled=${() => create.loading()}
  @click=${() => create.mutate({ name: "Sat" })}
>
  ${() => (create.loading() ? "Saving..." : "Create")}
</button>`;
```

### Lifecycle

1. `mutate(input)` called → `loading` flips to `true`, `error` cleared.
2. The fn resolves → `data` set, `invalidates` keys dropped (their subscribers refetch), `onSuccess(data, input)` fires.
3. The fn rejects → `error` set, `onError(err, input)` fires; the promise from `mutate` **re-throws** so `await form.handleSubmit` callers can `try/catch`.
4. `loading` flips back to `false`.

### Race protection

Calling `mutate` again before the previous one settles supersedes the first: only the latest call's result writes to signals (`runId` guard). The earlier promise still resolves to its own value for whoever awaited it — they just don't update the global signals.

### `reset()`

```ts
create.reset(); // data → undefined, error → undefined, loading → false
```

Useful when re-opening a form or moving away from the mutation's UI context.

## HTTP client — `createClient`

Optional helper that wraps `fetch` with a base URL, default headers, before/after interceptors, and shortcut methods (`get` / `post` / `put` / `patch` / `delete`) that JSON-encode bodies. It is **not** a feature-rich axios replacement — for retries, cancellation patterns beyond `AbortController`, or complex transformations, use a dedicated library.

### API

| Export | Signature | Purpose |
| --- | --- | --- |
| `createClient` | `(options?: ClientOptions) => Client` | Build a configured fetch wrapper |
| `HttpError` | class | Thrown by the default `after` interceptor for non-2xx responses; has `.status` and `.body` |
| `Client` | type | `{ request, get, post, put, patch, delete }` |
| `ClientOptions` | type | `{ baseUrl?, headers?, before?, after? }` |
| `RequestInterceptor` | type | `(init: RequestInit, url: string) => RequestInit \| Promise<RequestInit>` |
| `ResponseInterceptor` | type | `(res: Response, req: { url, init }) => unknown \| Promise<unknown>` |

### Basic usage

```ts
import { createClient } from "@sanify/core";

const api = createClient({
  baseUrl: "https://api.example.com",
  headers: { "X-App-Version": "1.0" },
});

const user = await api.get<User>("/me");
const created = await api.post<User>("/users", { name: "Sat" });
await api.delete<void>(`/users/${id}`);
```

### Reactive headers (e.g. auth token from a signal)

`headers` accepts either a static object or a function — the function is called **per request**, so reactive values stay fresh:

```ts
const [token, setToken] = persisted<string | null>("auth_token", null);

const api = createClient({
  baseUrl: "/api",
  headers: () => (token() ? { Authorization: `Bearer ${token()}` } : {}),
});
```

### Interceptors (`before` / `after`)

```ts
const api = createClient({
  before: async (init) => {
    // Attach correlation id, mutate body, sign request, etc.
    return { ...init, headers: { ...init.headers, "X-Trace-Id": uuid() } };
  },
  after: async (res, req) => {
    if (res.status === 401) {
      setToken(null);
      navigate("/login");
      throw new HttpError(401, null, "session expired");
    }
    if (!res.ok) throw new HttpError(res.status, await res.json().catch(() => null));
    if (res.status === 204) return undefined;
    return res.json();
  },
});
```

If you don't provide `after`, the default behaviour is:

- `res.ok === false` → throw `HttpError(res.status, parsedBody, body.message?)`
- `Content-Type: application/json` → `res.json()`
- `status: 204` → `undefined`
- otherwise → `res.text()`

### Integration with `resource` and `mutation`

The client is just a thin fetch wrapper — combine it with the rest of the module however you want:

```ts
const api = createClient({ baseUrl: "/api", headers: () => authHeaders() });

const user = resource((signal) => api.get<User>("/me", { signal }),
  { key: "me", staleTime: 60_000 });

const updateProfile = mutation(
  (input: ProfileEdit) => api.patch<User>("/me", input),
  { invalidates: ["me"] },
);
```

`AbortController.signal` flows naturally through: `resource` passes it to your fetcher, your fetcher forwards it to `api.get`, the client passes it to `fetch` via `init.signal`. Network cancellation works end-to-end.

## Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `data()` flips back to undefined unexpectedly | `key` getter returned `undefined` | Either ensure the key is always defined or use `initial` to set a placeholder |
| Two fetches for the "same" thing | `key` returned different strings (whitespace, casing) | Normalise the key (`.toLowerCase()`, `JSON.stringify` ordered) |
| Fetcher uses params but doesn't refetch | Params were read outside the fetcher (e.g. captured at creation) | Read params **inside** the fetcher or include them in `key` |
| Suspense never resolves | Resource was created outside the Suspense boundary | Move resource creation inside the component rendered by `Suspense` |
| Stale data after a mutation | Forgot `invalidates` on the mutation, or wrong key shape | Add `invalidates: [...]` matching the resource's `key` |
| Fetch isn't cancelled on nav | Fetcher ignores the `signal` argument | Accept `(signal)` and pass it to `fetch(url, { signal })` |
| Optimistic update doesn't show | Called `invalidate` instead of `setResourceData` | Use `setResourceData(key, optimisticValue)` — invalidate triggers refetch, not local update |

## Mental model

> A `resource` is `signal(data) + signal(loading) + signal(error) + effect(load)` over a shared `Map` cache plus a per-key version signal. A `mutation` is the same shape minus the cache, with an explicit `mutate` trigger plus invalidation. `createClient` is a tiny `fetch` wrapper that fits into any fetcher. Nothing else.
