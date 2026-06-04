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

function parseBoolFlag(args: string[], flag: string): boolean | undefined {
  if (args.includes(flag)) return true;
  if (args.includes(`--no-${flag.slice(2)}`)) return false;
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));

  let target = positional[0];
  let tailwind = parseBoolFlag(args, "--tailwind");

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

  if (tailwind === undefined) {
    const answer = (
      await rl.question("Sertakan Tailwind CSS? (y/N): ")
    ).trim().toLowerCase();
    tailwind = answer === "y" || answer === "yes";
  }

  rl.close();

  try {
    await scaffold({ targetDir, projectName, templateDir, tailwind });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`\nProject "${projectName}" dibuat di ${targetDir}\n`);
  if (tailwind) {
    console.log("Tailwind v4 disertakan — disusun via @tailwindcss/cli (no CDN).");
    console.log("  • src/tailwind.src.css — input dengan @theme mapping ke CSS vars");
    console.log("  • src/tailwind.css     — output (gitignored, di-regenerate)");
    console.log("  • bun dev              — spawn watcher otomatis");
    console.log("  • bun run build        — compile CSS lalu bundle\n");
  } else {
    console.log("Tailwind tidak disertakan. Template pakai semantic CSS classes");
    console.log("di src/style.css (.card, .btn, .stack, dst). Tambah Tailwind nanti");
    console.log("kalau perlu via: bun add -d tailwindcss @tailwindcss/cli\n");
  }
  console.log("Langkah berikutnya:");
  console.log(`  cd ${target}`);
  console.log("  bun install");
  console.log("  bun dev\n");
}

main();
