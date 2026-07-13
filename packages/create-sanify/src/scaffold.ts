// scaffold.ts — logika inti penyalinan template (bebas I/O interaktif agar bisa diuji)

import { cp, readFile, writeFile, rename, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ScaffoldOptions {
  /** Direktori tujuan project baru (harus belum ada atau kosong). */
  targetDir: string;
  /** Nama project, mengisi placeholder __PROJECT_NAME__. */
  projectName: string;
  /** Direktori template sumber yang akan disalin. */
  templateDir: string;
}

const PLACEHOLDER = "__PROJECT_NAME__";

async function isEmptyDir(dir: string): Promise<boolean> {
  const entries = await readdir(dir);
  return entries.length === 0;
}

/**
 * Salin template ke targetDir, ganti placeholder nama project,
 * dan kembalikan `_gitignore` menjadi `.gitignore`.
 */
export async function scaffold(opts: ScaffoldOptions): Promise<void> {
  const { targetDir, projectName, templateDir } = opts;

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
}
