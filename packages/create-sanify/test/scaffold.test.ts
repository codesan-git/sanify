// test/scaffold.test.ts
import { test, expect, afterEach } from "bun:test";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold } from "../src/scaffold.ts";

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = join(here, "..", "templates", "default");

const created: string[] = [];

afterEach(async () => {
  for (const dir of created) await rm(dir, { recursive: true, force: true });
  created.length = 0;
});

async function tmpTarget(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "sanify-scaffold-"));
  created.push(base);
  return join(base, "app-baru");
}

test("scaffold: menyalin template & mengganti placeholder", async () => {
  const targetDir = await tmpTarget();
  await scaffold({ targetDir, projectName: "app-baru", templateDir });

  // file inti ada
  expect(existsSync(join(targetDir, "package.json"))).toBe(true);
  expect(existsSync(join(targetDir, "src", "main.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "dev-server.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "favicon.svg"))).toBe(true);

  // _gitignore dikembalikan menjadi .gitignore
  expect(existsSync(join(targetDir, ".gitignore"))).toBe(true);
  expect(existsSync(join(targetDir, "_gitignore"))).toBe(false);

  // placeholder terganti
  const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
  expect(pkg.name).toBe("app-baru");
  const html = await readFile(join(targetDir, "index.html"), "utf8");
  expect(html).toContain("<title>app-baru</title>");
  expect(html).not.toContain("__PROJECT_NAME__");
});

test("scaffold: tanpa tailwind — hanya style.css, tidak ada Tailwind dep / CDN", async () => {
  const targetDir = await tmpTarget();
  await scaffold({ targetDir, projectName: "app-baru", templateDir });

  const html = await readFile(join(targetDir, "index.html"), "utf8");
  expect(html).toContain("./src/style.css");
  expect(html).not.toContain("cdn.tailwindcss.com");
  expect(html).not.toContain("tailwind.css");
  expect(html).toContain("<body>");

  const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
  expect(pkg.devDependencies?.tailwindcss).toBeUndefined();
  expect(pkg.scripts?.["build:css"]).toBeUndefined();

  expect(existsSync(join(targetDir, "src", "style.css"))).toBe(true);
  expect(existsSync(join(targetDir, "src", "theme.css"))).toBe(true);
  expect(existsSync(join(targetDir, "src", "tailwind.src.css"))).toBe(false);
});

test("scaffold: dengan tailwind v4 — devDeps + build:css + tailwind.src.css + watcher", async () => {
  const targetDir = await tmpTarget();
  await scaffold({ targetDir, projectName: "app-baru", templateDir, tailwind: true });

  // index.html: link compiled CSS + body class
  const html = await readFile(join(targetDir, "index.html"), "utf8");
  expect(html).toContain("./src/style.css");
  expect(html).toContain("./src/tailwind.css");
  expect(html).toContain(`class="bg-background text-foreground"`);
  expect(html).not.toContain("cdn.tailwindcss.com"); // tidak ada CDN lagi

  // package.json: devDeps + build script
  const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
  expect(pkg.devDependencies?.tailwindcss).toMatch(/^\^4/);
  expect(pkg.devDependencies?.["@tailwindcss/cli"]).toMatch(/^\^4/);
  expect(pkg.scripts?.["build:css"]).toContain("tailwindcss");
  expect(pkg.scripts?.build).toContain("build:css");

  // src/tailwind.src.css ada (input)
  expect(existsSync(join(targetDir, "src", "tailwind.src.css"))).toBe(true);
  const css = await readFile(join(targetDir, "src", "tailwind.src.css"), "utf8");
  expect(css).toContain('@import "tailwindcss"');
  expect(css).toContain("@theme");

  // dev-server.ts spawn watcher
  const devServer = await readFile(join(targetDir, "dev-server.ts"), "utf8");
  expect(devServer).toContain("spawn");
  expect(devServer).toContain("--watch");

  // .gitignore include tailwind.css output
  const gitignore = await readFile(join(targetDir, ".gitignore"), "utf8");
  expect(gitignore).toContain("src/tailwind.css");

  // file lama tetap ada
  expect(existsSync(join(targetDir, "src", "style.css"))).toBe(true);
  expect(existsSync(join(targetDir, "src", "theme.css"))).toBe(true);
});

test("scaffold: menolak direktori yang sudah berisi", async () => {
  const targetDir = await tmpTarget();
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, "ada.txt"), "isi");

  await expect(
    scaffold({ targetDir, projectName: "app-baru", templateDir }),
  ).rejects.toThrow(/tidak kosong/);
});
