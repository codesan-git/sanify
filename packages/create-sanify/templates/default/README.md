# __PROJECT_NAME__

A frontend project built on [Sanify](https://www.npmjs.com/package/@sanify/core) — a fine-grained reactive framework on top of Web Components.

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.0

## Setup

```bash
bun install
```

## Commands

| Command | Purpose |
| --- | --- |
| `bun dev` | Dev server at http://localhost:3000 with **HMR** |
| `bun run build` | Production bundle into `dist/` |
| `bun run typecheck` | TypeScript type check |

## Structure

```
src/
  main.ts            entry: loads app-root
  app.ts             root + router (including nested routes + outlet)
  state/             todos (persisted), settings (nested createStore)
  data/              sample data + simulated async fetch
  components/        nav-bar, users-sidebar, todo-item, live-clock
  pages/             home, todos, settings, user-list, user-detail, about
index.html           host page, loads the bundled main.js
dev-server.ts        Bun dev server with HMR + automatic bundling
```

## Showcased features

| Page | Sanify features |
| --- | --- |
| Home | `signal`, `onMount`/`onCleanup` (live-clock) |
| Todos | `For` (keyed list), `persisted` + cross-tab, `computed` |
| Settings | `createStore` fine-grained nested object (update by path) |
| Users | **nested router + outlet** (persistent layout), reactive `params()`, `resource` (async fetch) |
| About | reactive `query()` |

## HMR

`bun dev` supports Hot Module Replacement. Edit a component file → the UI updates
without a reload, and global state (`persisted`/`createStore`) is preserved.
Local state inside `setup` (e.g. a signal) resets on hot-remount. Each component
file ends with `if (import.meta.hot) import.meta.hot.accept();`.
