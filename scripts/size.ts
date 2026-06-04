// scripts/size.ts — bundle minified @sanify/core, cetak raw/gzip/brotli (KB)

import { brotliCompressSync, gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const entry = join(root, "packages/core/src/index.ts");
const work = mkdtempSync(join(tmpdir(), "sanify-size-"));
const out = join(work, "bundle.min.js");

const build = spawnSync(
  "bun",
  [
    "build",
    entry,
    "--outfile",
    out,
    "--minify",
    "--format",
    "esm",
    "--target",
    "browser",
  ],
  { stdio: "inherit", cwd: root },
);
if (build.status !== 0) {
  rmSync(work, { recursive: true, force: true });
  process.exit(build.status ?? 1);
}

const buf = readFileSync(out);
const gz = gzipSync(buf);
const br = brotliCompressSync(buf);
rmSync(work, { recursive: true, force: true });

const kb = (n: number): string => `${(n / 1024).toFixed(2)} KB`;
const pad = (s: string, n: number): string => s + " ".repeat(Math.max(0, n - s.length));

console.log("");
console.log(`@sanify/core bundle size:`);
console.log(`  ${pad("minified", 10)} ${kb(buf.length)}`);
console.log(`  ${pad("gzipped", 10)} ${kb(gz.length)}`);
console.log(`  ${pad("brotli", 10)} ${kb(br.length)}`);
