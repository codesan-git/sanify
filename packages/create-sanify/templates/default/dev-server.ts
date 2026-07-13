// dev-server.ts — Dev server Bun: HMR, SPA fallback, static files.
// Jalankan: bun dev

const PORT = 54712;

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

async function serveStatic(path: string): Promise<Response | null> {
  const file = Bun.file("." + path);
  if (!(await file.exists())) return null;
  const ext = path.slice(path.lastIndexOf("."));
  const headers: Record<string, string> = {};
  if (MIME[ext]) headers["Content-Type"] = MIME[ext];
  return new Response(file, { headers });
}

const server = Bun.serve({
  port: PORT,
  development: { hmr: true, console: true },

  async fetch(req) {
    const url = new URL(req.url);

    // Static files (CSS, SVG, asset, dll)
    if (url.pathname !== "/" && url.pathname.includes(".")) {
      const res = await serveStatic(url.pathname);
      if (res) return res;
    }

    // SPA: semua route → index.html
    const html = Bun.file("./index.html");
    if (!(await html.exists())) {
      return new Response("index.html not found — jalankan dari root project", { status: 500 });
    }
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

// Tampilkan URL
console.log(`\n  🏗️  Sanify dev server ready`);
console.log(`  http://localhost:${PORT}\n`);

// Graceful shutdown
process.on("SIGINT", () => {
  server.stop(true);
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
