// scaffold.ts — logika inti penyalinan template (bebas I/O interaktif agar bisa diuji)

import { cp, readFile, writeFile, rename, mkdir, readdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ScaffoldOptions {
  /** Direktori tujuan project baru (harus belum ada atau kosong). */
  targetDir: string;
  /** Nama project, mengisi placeholder __PROJECT_NAME__. */
  projectName: string;
  /** Direktori template sumber yang akan disalin. */
  templateDir: string;
  /** Sertakan Tailwind CSS v4 (self-hosted via CLI). Default: false. */
  tailwind?: boolean;
}

const PLACEHOLDER = "__PROJECT_NAME__";

// File CSS sumber untuk Tailwind v4. @theme memetakan utility class
// (bg-card, text-primary, dst.) ke CSS variable yang sudah didefinisikan di
// theme.css. Output di-compile ke src/tailwind.css (gitignored).
const TAILWIND_SRC_CSS = `@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
}
`;

// Pengganti dev-server.ts: spawn Tailwind CLI watcher di samping Bun server.
const DEV_SERVER_TAILWIND = `// dev-server.ts — dev server Bun dengan HMR + Tailwind watcher

import { spawn } from "node:child_process";
import index from "./index.html";

// Spawn Tailwind watcher — recompile src/tailwind.src.css → src/tailwind.css
const tw = spawn(
  "bunx",
  ["tailwindcss", "-i", "./src/tailwind.src.css", "-o", "./src/tailwind.css", "--watch"],
  { stdio: "inherit" },
);

const server = Bun.serve({
  port: 54712,
  development: { hmr: true, console: true },
  routes: {
    "/*": index, // SPA: semua route → index.html
  },
});

console.log(\`Dev server: \${server.url}\`);

const shutdown = (): void => {
  tw.kill("SIGTERM");
  server.stop(true);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
`;

async function isEmptyDir(dir: string): Promise<boolean> {
  const entries = await readdir(dir);
  return entries.length === 0;
}

interface PackageJson {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

/**
 * Salin template ke targetDir, ganti placeholder nama project,
 * dan kembalikan `_gitignore` menjadi `.gitignore`.
 *
 * Saat `tailwind: true`, scaffold-er menambahkan:
 *  - devDeps tailwindcss + @tailwindcss/cli (Tailwind v4)
 *  - src/tailwind.src.css (Tailwind input)
 *  - script build:css + chain ke build
 *  - dev-server.ts yang spawn Tailwind watcher
 *  - link compiled CSS di index.html (sesudah style.css)
 *  - body class bg-background text-foreground
 *  - src/tailwind.css ke .gitignore
 */
export async function scaffold(opts: ScaffoldOptions): Promise<void> {
  const { targetDir, projectName, templateDir, tailwind = false } = opts;

  if (existsSync(targetDir) && !(await isEmptyDir(targetDir))) {
    throw new Error(`Direktori "${targetDir}" sudah ada dan tidak kosong.`);
  }

  await mkdir(targetDir, { recursive: true });
  await cp(templateDir, targetDir, { recursive: true });

  // _gitignore → .gitignore (npm menghapus .gitignore dari paket terpublish)
  const gitignoreSrc = join(targetDir, "_gitignore");
  if (existsSync(gitignoreSrc)) {
    await rename(gitignoreSrc, join(targetDir, ".gitignore"));
  }

  // Ganti placeholder __PROJECT_NAME__ pada file yang membutuhkan
  for (const rel of ["package.json", "README.md", "index.html"]) {
    const file = join(targetDir, rel);
    if (!existsSync(file)) continue;
    const content = await readFile(file, "utf8");
    await writeFile(file, content.replaceAll(PLACEHOLDER, projectName));
  }

  if (tailwind) {
    await enableTailwind(targetDir);
  }
}

async function enableTailwind(targetDir: string): Promise<void> {
  // 1. package.json: tambah devDeps + build:css script
  const pkgPath = join(targetDir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as PackageJson;
  pkg.devDependencies = {
    ...pkg.devDependencies,
    "@tailwindcss/cli": "^4.3.0",
    tailwindcss: "^4.3.0",
  };
  pkg.scripts = {
    ...pkg.scripts,
    "build:css":
      "tailwindcss -i ./src/tailwind.src.css -o ./src/tailwind.css --minify",
    build: "rm -rf dist && bun run build:css && bun build ./index.html --outdir ./dist --minify",
  };
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // 2. Tulis src/tailwind.src.css (input)
  await writeFile(join(targetDir, "src", "tailwind.src.css"), TAILWIND_SRC_CSS);

  // 3. Replace dev-server.ts dengan versi yang spawn watcher
  await writeFile(join(targetDir, "dev-server.ts"), DEV_SERVER_TAILWIND);

  // 4. Modify index.html: tambah link ke compiled CSS + body class
  const htmlPath = join(targetDir, "index.html");
  let html = await readFile(htmlPath, "utf8");
  html = html.replace(
    '<link rel="stylesheet" href="./src/style.css" />',
    '<link rel="stylesheet" href="./src/style.css" />\n    <link rel="stylesheet" href="./src/tailwind.css" />',
  );
  html = html.replace("<body>", '<body class="bg-background text-foreground">');
  await writeFile(htmlPath, html);

  // 5. Append src/tailwind.css (compiled output) ke .gitignore
  await appendFile(
    join(targetDir, ".gitignore"),
    "\n# Tailwind compiled output (regenerated by build:css)\nsrc/tailwind.css\n",
  );
}
