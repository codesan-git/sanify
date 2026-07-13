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

  expect(existsSync(join(targetDir, "package.json"))).toBe(true);
  expect(existsSync(join(targetDir, "src", "main.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "dev-server.ts"))).toBe(true);
  expect(existsSync(join(targetDir, "favicon.svg"))).toBe(true);

  expect(existsSync(join(targetDir, ".gitignore"))).toBe(true);
  expect(existsSync(join(targetDir, "_gitignore"))).toBe(false);

  const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
  expect(pkg.name).toBe("app-baru");
  const html = await readFile(join(targetDir, "index.html"), "utf8");
  expect(html).toContain("<title>app-baru</title>");
  expect(html).not.toContain("__PROJECT_NAME__");
});

test("scaffold: template pakai semantic CSS — style.css + theme.css", async () => {
  const targetDir = await tmpTarget();
  await scaffold({ targetDir, projectName: "app-baru", templateDir });

  expect(existsSync(join(targetDir, "src", "style.css"))).toBe(true);
  expect(existsSync(join(targetDir, "src", "theme.css"))).toBe(true);

  const html = await readFile(join(targetDir, "index.html"), "utf8");
  expect(html).toContain("./src/style.css");
  expect(html).not.toContain("tailwind");
  expect(html).not.toContain("cdn.");

  const pkg = JSON.parse(await readFile(join(targetDir, "package.json"), "utf8"));
  expect(pkg.devDependencies?.tailwindcss).toBeUndefined();
  expect(pkg.scripts?.["build:css"]).toBeUndefined();
});

test("scaffold: menolak direktori yang sudah berisi", async () => {
  const targetDir = await tmpTarget();
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, "ada.txt"), "isi");

  await expect(
    scaffold({ targetDir, projectName: "app-baru", templateDir }),
  ).rejects.toThrow(/tidak kosong/);
});
