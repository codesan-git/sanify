// dev-server.ts — Dev server Bun: TypeScript transpile, HMR, SPA fallback.
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

// Transpiler TypeScript → JavaScript untuk dev (no-bundle, file per file).
// Browser menerima JS, bukan TS mentah.
const tsTranspiler = new Bun.Transpiler({ loader: "tsx" });

// Cache hasil transpilasi per path agar tidak re-transpile tiap request.
const transpileCache = new Map<string, string>();
function bustTranspileCache() {
  transpileCache.clear();
}

async function serveStatic(path: string): Promise<Response | null> {
  const file = Bun.file("." + path);
  if (!(await file.exists())) return null;

  // TypeScript / TSX → transpile ke JS
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    let js = transpileCache.get(path);
    if (!js) {
      const src = await file.text();
      js = tsTranspiler.transformSync(src);
      transpileCache.set(path, js);
    }
    return new Response(js, {
      headers: { "Content-Type": "application/javascript; charset=utf-8" },
    });
  }

  const ext = path.slice(path.lastIndexOf("."));
  const headers: Record<string, string> = {};
  if (MIME[ext]) headers["Content-Type"] = MIME[ext];
  return new Response(file, { headers });
}

// ── HMR via Server-Sent Events ────────────────────────────────────────────

// Klien SSE yang sedang terhubung — tiap klien adalah callback pengirim event.
type SSEClient = (event: string, data: string) => void;
const clients = new Set<SSEClient>();

// Pantau perubahan file sumber — trigger reload ke semua klien.
// eslint-disable-next-line
const B = Bun as unknown as { watch(opts: { cwd: string; patterns: string[]; onChange(kind: string, path: string): void }): { close(): void } };
const watcher = B.watch({
  cwd: ".",
  patterns: ["src/**/*.ts", "src/**/*.css", "index.html"],
  onChange(_kind: string, path: string) {
    bustTranspileCache();
    for (const send of clients) {
      send("reload", path);
    }
  },
});

// Inject script HMR ke halaman HTML.
// Script ini membuka koneksi SSE ke /__hmr dan reload halaman saat
// server mengirim event "reload".
function injectHMR(html: string): string {
  const script = `<script>
  (function(){
    if (window.__sanifyHmr) return;
    window.__sanifyHmr = true;
    var src = new EventSource("/__hmr");
    src.addEventListener("reload", function(e){
      console.log("[hmr] reload:", e.data);
      src.close();
      location.reload();
    });
    src.onerror = function(){
      src.close();
      setTimeout(function(){ location.reload(); }, 500);
    };
  })();
</script>`;
  return html.replace("</body>", script + "</body>");
}

// ── Server ────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    // HMR SSE endpoint — klien terhubung ke sini untuk terima sinyal reload.
    if (url.pathname === "/__hmr") {
      let closed = false;
      const stream = new ReadableStream({
        start(controller) {
          const send = (_event: string, data: string) => {
            if (closed) return;
            controller.enqueue(`event: reload\ndata: ${data}\n\n`);
          };
          clients.add(send);
          req.signal.addEventListener("abort", () => {
            closed = true;
            clients.delete(send);
          });
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Static files (CSS, SVG, TS, asset, dll)
    if (url.pathname !== "/" && url.pathname.includes(".")) {
      const res = await serveStatic(url.pathname);
      if (res) return res;
    }

    // SPA: semua route → index.html (dengan inject HMR script)
    const htmlFile = Bun.file("./index.html");
    if (!(await htmlFile.exists())) {
      return new Response("index.html not found — jalankan dari root project", { status: 500 });
    }
    const html = await htmlFile.text();
    return new Response(injectHMR(html), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

// Tampilkan URL
console.log(`\n  🏗️  Sanify dev server ready`);
console.log(`  http://localhost:${PORT}\n`);

// Graceful shutdown
process.on("SIGINT", () => {
  watcher.close();
  server.stop(true);
  process.exit(0);
});
process.on("SIGTERM", () => {
  watcher.close();
  server.stop(true);
  process.exit(0);
});
