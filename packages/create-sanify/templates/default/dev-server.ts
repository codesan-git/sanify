// dev-server.ts — dev server Bun dengan HMR (import.meta.hot) + bundling otomatis

import index from "./index.html";

const server = Bun.serve({
  port: 54712,
  development: { hmr: true, console: true },
  routes: {
    "/*": index, // SPA: semua route → index.html
  },
});

console.log(`Dev server: ${server.url}`);

process.on("SIGINT", () => { server.stop(true); process.exit(0); });
process.on("SIGTERM", () => { server.stop(true); process.exit(0); });
