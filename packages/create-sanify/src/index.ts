#!/usr/bin/env node
// index.ts — CLI `create-sanify`: scaffold project Sanify baru

import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { scaffold } from "./scaffold.ts";

const here = dirname(fileURLToPath(import.meta.url));
// Saat dev: src/ → ../templates. Saat terpublish: dist/ → ../templates.
const templateDir = join(here, "..", "templates", "default");

function isValidName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(name);
}

async function main(): Promise<void> {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  let target = positional[0];

  const rl = createInterface({ input: stdin, output: stdout });

  if (!target) {
    target = (await rl.question("Nama project: ")).trim();
  }

  if (!target) {
    rl.close();
    console.error("Error: nama project wajib diisi.");
    process.exit(1);
  }

  const targetDir = resolve(process.cwd(), target);
  const projectName = basename(targetDir);

  if (!isValidName(projectName)) {
    rl.close();
    console.error(
      `Error: nama "${projectName}" tidak valid (huruf kecil, angka, "-", "_", ".").`,
    );
    process.exit(1);
  }

  rl.close();

  try {
    await scaffold({ targetDir, projectName, templateDir });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`\nProject "${projectName}" dibuat di ${targetDir}\n`);
  console.log("Template pakai semantic CSS (src/style.css, src/theme.css).");
  console.log("Langkah berikutnya:");
  console.log(`  cd ${target}`);
  console.log("  bun install");
  console.log("  bun dev\n");
}

main();
