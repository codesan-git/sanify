---
name: sanify-ui
description: Panduan styling dan UI untuk Sanify framework — Light DOM, plain CSS + custom properties, BEM-style class, layout primitives, dark mode. Gunakan saat membuat komponen baru, styling halaman, atau review UI di project Sanify.
---

# Sanify UI Skill

Panduan styling untuk aplikasi Sanify. Arsitektur: **Light DOM + plain CSS + custom properties + BEM-style class**. Zero dependency, zero build step untuk CSS.

## Filosofi styling

1. **Tidak ada dependency CSS.** Tidak Tailwind, tidak CSS-in-JS runtime. Hanya file `.css` yang di-link di `index.html`.
2. **Custom properties untuk semuanya.** Warna, spacing, radius, shadow — semua lewat `var(--token)`.
3. **BEM-style naming.** `.block`, `.block__element`, `.block--modifier`. Bukan utility-first.
4. **Light DOM.** Semua elemen adalah anak langsung host. Global CSS langsung berlaku.
5. **Reactive class.** Toggle class dinamis pakai signal di template: `class=${() => active() ? "btn btn--primary" : "btn"}`.

## Struktur file CSS

```
src/
├── style.css    ← reset, layout primitives, komponen, state helpers
└── theme.css    ← design tokens: warna, dark mode
```

Di `index.html`, cukup satu `<link>`:

```html
<link rel="stylesheet" href="./src/style.css" />
```

`style.css` meng-`@import` `theme.css` di baris pertama — jadi token selalu tersedia.

## Design tokens (`theme.css`)

### Konvensi nama token

```
--{kategori}            → nilai dasar
--{kategori}-foreground → warna teks di atasnya
```

| Token | Peran | Contoh pakai |
|---|---|---|
| `--background` / `--foreground` | Warna dasar halaman | `body { background: var(--background); }` |
| `--card` / `--card-foreground` | Latar panel & kartu | `.card { background: var(--card); }` |
| `--primary` / `--primary-foreground` | Aksen utama (tombol, link) | `.btn--primary { background: var(--primary); }` |
| `--secondary` / `--secondary-foreground` | Aksen kedua | Elemen sukses, badge |
| `--muted` / `--muted-foreground` | Elemen subtle | `.btn` default, teks sekunder |
| `--border` | Garis batas | `.nav`, input, separator |
| `--ring` | Focus ring | `:focus-visible` |

### Menambah token baru

Saat butuh token baru (mis. `--danger` untuk error), tambahkan di `:root` dan `.dark`:

```css
:root {
  --danger: #e64553;
  --danger-foreground: #fff;
}
.dark {
  --danger: #f38ba8;
  --danger-foreground: #1e1e2e;
}
```

**JANGAN hardcode warna di komponen** — selalu pakai token. Pengecualian: warna satu kali pakai yang tidak punya makna semantik.

### Dark mode

Toggle via class `dark` di `<html>`:

```typescript
// Di setup app-root
const toggleTheme = () => {
  document.documentElement.classList.toggle("dark");
};
```

Semua token otomatis berganti karena `.dark` meng-override `:root`.

## Layout primitives

**JANGAN menulis layout CSS inline atau per komponen.** Pakai class layout yang sudah ada:

### `.page` — container halaman terpusat

```css
.page {
  max-width: 28rem;
  margin: 2.5rem auto;
  padding: 0 1rem;
}
```

```html
<div class="page">
  <!-- konten halaman -->
</div>
```

### `.card` — panel / kartu

```css
.card {
  background: var(--card);
  color: var(--card-foreground);
  border-radius: .75rem;
  box-shadow: 0 1px 3px rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1);
  padding: 1.5rem;
}
```

```html
<div class="card">
  <!-- konten panel -->
</div>
```

### `.stack` — tumpukan vertikal

Memberi jarak antar anak dengan `margin-top`. **Pakai di parent**, bukan di anak.

```css
.stack > * + * { margin-top: 1rem; }
```

```html
<div class="card stack">
  <h2>Judul</h2>
  <p>Paragraf pertama — tidak kena margin-top.</p>
  <p>Paragraf kedua — kena margin-top: 1rem.</p>
</div>
```

Kombinasikan dengan layout lain: `.card stack`, `.page stack`, dll.

### `.cluster` — baris horizontal

```css
.cluster { display: flex; align-items: center; gap: .75rem; }
```

```html
<div class="cluster">
  <button class="btn btn--primary">Simpan</button>
  <button class="btn btn--ghost">Batal</button>
</div>
```

### Kapan bikin layout baru

Kalau `.stack` / `.cluster` / `.page` / `.card` **tidak cukup**, tambah class layout baru di `style.css`. Contoh:

```css
/* Grid 2 kolom responsif */
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

/* Sidebar + konten */
.shell {
  display: flex;
  min-height: 100vh;
}
.shell__sidebar { width: 16rem; flex-shrink: 0; }
.shell__content { flex: 1; }
```

**Prinsip**: class layout hanya ngatur *tata letak* (display, gap, margin, padding, width/height), BUKAN *dekorasi* (warna, shadow, border-radius). Dekorasi ada di class komponen.

## Komponen

### Tombol (`.btn`)

Class dasar + modifier BEM-style:

```css
.btn {
  display: inline-flex;
  align-items: center;
  padding: .375rem .875rem;
  border-radius: .375rem;
  font-size: .875rem;
  font-weight: 500;
  border: 1px solid transparent;
  background: var(--muted);
  color: var(--foreground);
  transition: filter .1s;
}
.btn:hover { filter: brightness(.93); }
.btn--primary { background: var(--primary); color: var(--primary-foreground); }
.btn--ghost   { background: transparent; border-color: var(--border); }
```

```html
<button class="btn">Default</button>
<button class="btn btn--primary">Primary</button>
<button class="btn btn--ghost">Ghost</button>
```

**Reactive toggle**:

```typescript
html`<button
  class=${() => saving() ? "btn btn--primary" : "btn"}
  @click=${handleSave}
>${() => saving() ? "Menyimpan…" : "Simpan"}</button>`
```

### Navigasi (`.nav`)

Menggunakan BEM: `.nav` (block), `.nav__inner`, `.nav__brand`, `.nav__link`, `.nav__link--active`.

```html
<nav class="nav">
  <div class="nav__inner">
    <span class="nav__brand">Brand</span>
    <a class="nav__link" href="/">Home</a>
    <a class="nav__link nav__link--active" href="/about">About</a>
  </div>
</nav>
```

### Form

Belum ada class form bawaan di template. Kalau butuh, tambahkan:

```css
.input {
  display: block;
  width: 100%;
  padding: .5rem .75rem;
  border-radius: .375rem;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  font-size: .875rem;
}
.input:focus {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 2px var(--ring);
}
.input--error { border-color: var(--danger); }

.label {
  display: block;
  font-size: .875rem;
  font-weight: 500;
  margin-bottom: .25rem;
}
```

### List item (`.list-item`)

Baris dalam daftar — biasanya dipakai dengan `For` / `Index`.

```css
.list-item {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding: .75rem;
  background: var(--card);
  border-radius: .5rem;
}
```

```html
${For(
  () => items(),
  (item) => html`<div class="list-item">...</div>`,
  { key: (it) => it.id },
)}
```

## State helpers

Class kecil untuk keadaan umum. **Tidak boleh dipakai sebagai class utama komponen.**

| Class | Fungsi |
|---|---|
| `.muted` | Teks sekunder / kurang penting |
| `.loading-text` | Indikator loading |
| `.error-text` | Pesan error |

```html
<p class="muted">Ini teks sekunder.</p>
<p class="loading-text">Memuat data…</p>
<p class="error-text">Email tidak valid.</p>
```

## Typography

### Default (dari reset)

```css
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.5;
}
h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 .5rem; }
h2 { font-size: 1.1rem; font-weight: 600; margin: 0 0 .25rem; }
p  { margin: 0; }
a  { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
```

### Aturan

- **Gunakan elemen HTML semantik** (`h1`, `h2`, `p`, `ul`, `strong`) — bukan `<div>` atau `<span>` dengan class.
- **Jangan bikin class typography baru** kecuali benar-benar butuh ukuran/syle yang tidak ada.
- Kalau butuh ukuran khusus, tambahkan sebagai utility kecil: `.text-sm { font-size: .875rem; }`, `.text-lg { font-size: 1.125rem; }`.

## Reactive styling

### Toggle class

Cara paling umum. Gunakan ternary di `${}`:

```typescript
html`<div class=${() => open() ? "modal modal--open" : "modal"}></div>`
```

### Dynamic inline style

Untuk nilai yang berubah terus (mis. posisi, warna custom):

```typescript
html`<div style=${() => `--x: ${x()}px; --y: ${y()}px`}></div>`
```

Jangan pakai inline style untuk nilai statis — itu urusan CSS.

### Conditional render

```typescript
${() => error() ? html`<p class="error-text">${error()}</p>` : null}
```

## Responsive

Tambahkan breakpoint sebagai at-rule di `style.css`:

```css
@media (max-width: 640px) {
  .page { max-width: 100%; padding: 0 .75rem; }
  .grid-2 { grid-template-columns: 1fr; }
}
```

Mobile-first: tulis dulu style mobile (default), lalu override di `min-width`.

## CSS Modules (opsional, untuk scoping)

Kalau komponen perlu style terisolasi:

```
src/components/my-widget.ts
src/components/my-widget.module.css
```

```typescript
import styles from "./my-widget.module.css";

component("my-widget", () => {
  return () => html`
    <div class=${styles.container}>
      <h2 class=${styles.title}>Widget</h2>
    </div>
  `;
});
```

**Tetap pakai token dari `theme.css`** di dalam CSS Module:

```css
/* my-widget.module.css */
.container {
  background: var(--card);
  border-radius: .75rem;
  padding: 1rem;
}
```

CSS Modules dan global CSS bisa coexist. Pakai CSS Modules hanya kalau:
- Komponen dipakai di banyak tempat dan class global bisa bentrok.
- Komponen punya banyak style internal yang tidak relevan secara global.

## Animasi & transisi

### Transisi sederhana

```css
.btn { transition: filter .1s; }
.modal { transition: opacity .15s, transform .15s; }
```

### Animation enter/leave

Sanify punya `Transition` directive:

```typescript
import { Transition } from "@sanify/core";

${Transition({
  children: () => modal() ? html`<div class="modal">...</div>` : null,
  enter: { class: "modal-enter", duration: 150 },
  leave: { class: "modal-leave", duration: 150 },
})}
```

### FLIP animation (list reorder)

Sanify punya `TransitionGroup` untuk animasi reorder otomatis:

```typescript
import { TransitionGroup } from "@sanify/core";
// Lihat sanify skill untuk detail API
```

## Aksesibilitas

- **Focus ring**: pakai token `--ring`.
- **Link internal**: pakai atribut `data-link` (router Sanify).
- **Tombol**: selalu pakai `<button>`, bukan `<div onclick>`.
- **Form**: selalu pairing `<label>` dengan `<input>`.
- **Icon-only button**: tambahkan `aria-label`.
- **Heading hierarchy**: jangan loncat level (h1 → h3 tanpa h2).

```html
<!-- ✅ Benar -->
<button class="btn btn--ghost" aria-label="Tutup">
  <svg>...</svg>
</button>

<!-- ❌ Salah -->
<div class="btn btn--ghost" @click=${close}>
  <svg>...</svg>
</div>
```

## Anti-patterns

### ❌ Hardcode warna

```html
<!-- ❌ -->
<button style="background: #f5a97f; color: #2a1505">Klik</button>

<!-- ✅ -->
<button class="btn btn--primary">Klik</button>
```

### ❌ Inline style untuk layout

```html
<!-- ❌ -->
<div style="display: flex; gap: 1rem; max-width: 28rem; margin: 2.5rem auto;">

<!-- ✅ -->
<div class="page">
  <div class="cluster">
```

### ❌ Utility class yang tidak ada

```html
<!-- ❌ — class ini tidak didefinisikan di style.css -->
<div class="flex items-center gap-4 mt-8">

<!-- ✅ -->
<div class="cluster" style="margin-top: 2rem;">
```

### ❌ Class komponen ditulis inline di template

```html
<!-- ❌ — bikin style di atribut jadi panjang & gak reusable -->
<button style="display:inline-flex;align-items:center;padding:.375rem .875rem;...">

<!-- ✅ -->
<button class="btn btn--primary">
```

### ❌ Shadow DOM

**Jangan.** Sudah diputuskan pakai Light DOM. Semua style dari `style.css` harus menembus ke dalam komponen.

## Alur kerja styling

1. **Lihat dulu yang sudah ada** — cek `style.css` dan `theme.css`. Jangan buat class baru kalau sudah ada yang cocok.
2. **Tambah token** di `theme.css` kalau butuh variabel desain baru (warna, spacing).
3. **Tambah class** di `style.css` kalau butuh komponen atau layout baru.
4. **Gunakan class** di template komponen dengan BEM naming.
5. **Toggle reactive** pakai `${() => condition() ? "class-a" : "class-b"}`.
6. **Review**: cek dark mode, responsive, dan state (loading, error, empty).

## File referensi

- `sanify` skill — framework internals, component API, template syntax
- `AGENTS.md` — arsitektur dan aturan framework
- Template bawaan `packages/create-sanify/templates/default/src/`:
  - `theme.css` — contoh design tokens
  - `style.css` — contoh layout + komponen + state
  - `components/nav-bar.ts` — contoh komponen dengan BEM styling + reactive class
  - `pages/home-page.ts` — contoh halaman
  - `pages/demo-page.ts` — contoh halaman dengan signal + resource
