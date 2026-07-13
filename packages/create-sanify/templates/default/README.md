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
| `bun dev` | Dev server at http://localhost:54712 with **HMR** |
| `bun run build` | Production bundle into `dist/` |
| `bun run typecheck` | TypeScript type check |

## Structure

```
src/
  main.ts            entry: loads app-root
  app.ts             root + router (including nested routes + outlet)
  data/              sample data + simulated async fetch
  components/        nav-bar
  pages/             home, demo
index.html           host page, loads the bundled main.js
dev-server.ts        Bun dev server with HMR + static file serving
```

## Showcased features

| Page | Sanify features |
| --- | --- |
| Home | `signal`, `router`, nested routes, `params()`, `For` (keyed list) |
| Demo | `signal`, `computed`, `onMount`, `resource` (async fetch) |

## Styling

Template uses semantic CSS classes (`.card`, `.btn`, `.stack`, `.cluster`, etc.) defined in `src/style.css` and CSS custom properties in `src/theme.css`. No build step needed for CSS — just edit and refresh.

## HMR

`bun dev` supports Hot Module Replacement. Edit a component file → the UI updates without a reload.
