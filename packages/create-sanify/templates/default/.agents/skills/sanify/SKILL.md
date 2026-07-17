---
name: sanify
description: Panduan untuk bekerja dengan Sanify Frontend framework — Web Components reaktif fine-grained tanpa virtual DOM. Gunakan saat mengedit, menambah fitur, debugging, atau review code di project Sanify.
---

# Sanify Framework Skill

Framework frontend fine-grained berbasis Web Components asli. Komponen jalan **sekali**, reactivity **fine-grained** (signal nempel langsung ke node DOM), **tanpa virtual DOM** dan **tanpa diffing global**. Gaya SolidJS, ringan (~23 KB gzip npm, ~68 KB bundle). Versi terkini: **v0.7.0**.

## Memulai project baru

```bash
bun create sanify my-app                # basic
bun create sanify my-app --tailwind     # dengan Tailwind v4
cd my-app && bun install && bun dev
```

Scaffold langsung siap pakai — dev server, HMR, TypeScript strict, SPA routing. **Jangan setup manual.** Selalu pakai `bun create sanify` untuk project baru.

## Aturan utama (jangan dilanggar)

1. **Semua turunan dari `signal.ts`.** Kalau ragu menambah mesin baru, tanyakan: apakah cukup dengan signal + effect?
2. **Komponen jalan SEKALI.** Setup `component(tag, setup)` dieksekusi satu kali. Return value = view function yang reaktif.
3. **Fine-grained, bukan re-render.** Satu binding = satu effect yang menyentuh satu node. Jangan diffing menyeluruh.
4. **Light DOM, BUKAN Shadow DOM.** Keputusan sadar agar Tailwind jalan global.
5. **Bahasa**: README & dokumentasi pakai bahasa Inggris. Komentar kode (`.ts`) pakai bahasa Indonesia.
6. **JANGAN publish npm tanpa diminta eksplisit.** Build, test, typecheck, edit `package.json` boleh; publish hanya saat user minta.

## Tooling framework

| Perintah | Kegunaan |
|----------|----------|
| `bun test` | 161 test, 22 file |
| `bun run typecheck` | TypeScript `--noEmit` |
| `bun run build` | Bundle JS ke `dist/index.js` |
| `bun run build:types` | Emit `.d.ts` lewat `tsc` |

**PENTING**: `--target=browser` baca `dist/index.js`, BUKAN `src/index.ts`. Setiap ubah source, WAJIB `bun run build`.

## Arsitektur module (v0.7.0)

```
packages/core/src/
├── reactivity/
│   ├── signal.ts      — Inti: signal, effect, computed, Owner, context, batching
│   └── helpers.ts     — createSelector, debounced, throttled
├── rendering/
│   ├── component.ts   — Web Component: setup/view lifecycle, props, HMR
│   ├── template.ts    — html``, compile, bindChild, For, directives, FLIP
│   └── flow.ts        — Show, Switch/Match, Index
├── router/
│   └── router.ts      — History API, nested routes, loader, guard, lazy, hash nav
├── resource/
│   ├── resource.ts    — fetch: cache, dedupe, SWR, polling, retry, Suspense
│   ├── mutation.ts    — Write-side counterpart
│   ├── client.ts      — fetch wrapper with interceptors
│   └── ws.ts          — WebSocket reaktif (createWS)
├── form/
│   ├── form.ts        — createForm, field-level validation, async validators
│   └── validators.ts  — string, number, boolean, email, custom, schema()
├── store/
│   ├── reactive.ts    — createStore (Proxy-based fine-grained store)
│   └── store.ts       — persisted() signal (localStorage + cross-tab sync)
└── index.ts           — Public API exports
```

## API highlights (v0.7.0)

### WebSocket reaktif (`createWS`)
```typescript
const ws = createWS<Alert[]>("ws://localhost:8080/events", {
  reconnectDelay: 2000,
  maxRetries: 10,
});
// ws.data() — signal data terbaru (auto JSON parse)
// ws.status() — "connecting" | "open" | "closed" | "reconnecting"
// ws.error() — error terakhir (null saat connected)
// ws.send(msg) — kirim (auto JSON.stringify)
// ws.close() — tutup permanen
```

### Resource polling + retry
```typescript
const cameras = resource(
  (signal) => fetch("/api/cameras", { signal }).then(r => r.json()),
  {
    pollingInterval: 5000,  // refresh tiap 5 detik (SWR style)
    retry: 3,               // auto-retry 3x dengan exponential backoff
    retryDelay: 1000,       // delay awal 1 detik
  }
);
```

## Pola-pola kritis

### Setup vs View (rawan bug #1)

```typescript
// ❌ SALAH — signal dibaca di setup, gak reaktif
component("x-page", () => {
  const id = params().id;
  return () => html`<p>${id}</p>`;
});

// ✅ BENAR — signal dibaca di view, reaktif
component("x-page", () => {
  return () => {
    const id = params().id;
    return html`<p>${id}</p>`;
  };
});
```

Mulai v0.5.3, framework kasih `console.warn` kalau signal dibaca di setup tanpa observer.

### Aturan template (rawan bug #2)

```typescript
// Binding reaktif HARUS fungsi
html`<p>${() => count()}</p>`    // ✅
html`<p>${count()}</p>`          // ❌ dievaluasi sekali

// Atribut vs property vs event
html`<div class=${...}></div>`   // name=... → atribut
html`<div .prop=${...}></div>`   // .name=...→ property
html`<button @click=${...}>`     // @event=...→ listener
```

### Boolean attribute vs property (rawan bug #3)

Atribut boolean HTML (`disabled`, `checked`, `readonly`, `hidden`) bekerja
berdasarkan **presence**, bukan nilai. `disabled="false"` tetap disabled.

```typescript
// ❌ SALAH — atribut boolean, nilai string diabaikan
html`<button disabled=${() => !valid()}>Kirim</button>`
// Hasil: disabled="false" → button TETAP disabled

// ✅ BENAR — pakai property binding (prefix titik)
html`<button .disabled=${() => !valid()}>Kirim</button>`
// Hasil: el.disabled = false → button enabled

// ✅ BENAR — set null/undefined untuk menghapus atribut boolean
html`<button disabled=${() => isBusy() ? "" : null}>Kirim</button>`
```

**Aturan**: kalau nilainya boolean, selalu pakai `.prop`. Atribut boolean hanya
untuk nilai statis (`<input disabled />`).

### Select / dropdown (rawan bug #5)

Mengikat nilai `<select>` ke signal lebih reliable lewat `.value` di `<select>`,
BUKAN `.selected` di tiap `<option>`.

```typescript
// ❌ RENTAN — .selected di option kadang tidak update DOM
const [sel, setSel] = signal("a");
return () => html`
  <select>
    <option value="a" .selected=${() => sel() === "a"}>A</option>
    <option value="b" .selected=${() => sel() === "b"}>B</option>
  </select>
`;

// ✅ BENAR — .value di select + @change handler
const [sel, setSel] = signal("a");
return () => {
  const handleChange = (e: Event) => {
    setSel((e.target as HTMLSelectElement).value);
  };
  return html`
    <select .value=${() => sel()} @change=${handleChange}>
      <option value="a">A</option>
      <option value="b">B</option>
    </select>
    <p>Dipilih: ${() => sel()}</p>
  `;
};
```

### Conditional rendering (rawan bug #4)

Nilai di dalam `${...}` template: kalau **fungsi** → reaktif, kalau **bukan** → static.

```typescript
// ❌ SALAH — bukan fungsi, dievaluasi SEKALI saat rendering
const [open, setOpen] = signal(false);
return () => html`
  ${open() ? html`<p>Terbuka</p>` : null}
`;
// open berubah → DOM TIDAK update

// ✅ BENAR — bungkus dalam arrow function
return () => html`
  ${() => open() ? html`<p>Terbuka</p>` : null}
`;

// ✅ BENAR — pakai Show control flow (lebih bersih)
return () => html`
  ${Show(open, () => html`<p>Terbuka</p>`)}
`;
```

### List rendering: For vs Index vs map

**`${() => arr().map(...)}`** — re-render semua item tiap kali array berubah.
Hanya untuk list kecil (< 10 item) atau array yang jarang berubah.

**`For(each, render, { key })`** — keyed reconciliation. Item dengan key sama
→ DOM dipertahankan, hanya nilai signal yang diupdate. Untuk list dinamis.

```typescript
const [items, setItems] = signal([
  { id: 1, text: "A" },
  { id: 2, text: "B" },
]);

return () => html`
  <ul>
    ${For(
      () => items(),
      (item) => html`<li>${() => item().text}</li>`,
      { key: (it) => it.id },
    )}
  </ul>
`;

// Saat items berubah (tambah, hapus, reorder):
// - Item dengan key 1 & 2 → DOM dipertahankan
// - Item baru (key 3) → DOM dibuat
// - Item hilang → DOM dihapus
// - Item reorder → FLIP animation (pakai TransitionGroup)
```

**`Index(each, render)`** — position-based. Elemen DOM dipertahankan per
**indeks**, bukan key. Nilai item diperbarui di tempat. Cocok untuk data
primitif yang sering berubah urutan.

```typescript
const [colors, setColors] = signal(["Merah", "Hijau", "Biru"]);

return () => html`
  ${Index(
    () => colors(),
    (color) => html`<span>${() => color()}</span>`,
  )}
`;

// Saat array berubah: elemen di indeks 0 selalu di-reuse, indeks 1 reuse, dst.
```

### persisted() — localStorage + cross-tab sync

Signal yang otomatis tersimpan ke `localStorage`. Survive page refresh.
Sinkron antar tab via `storage` event.

```typescript
import { persisted } from "@sanify/core";

// persisted() mengembalikan [get, set] — sama seperti signal()
const [count, setCount] = persisted("my-count", 0);

// count() — baca nilai
// setCount(5) — set absolut
// setCount((prev) => prev + 1) — update fungsi

component("x-counter", () => {
  return () => html`
    <p>${() => count()}</p>
    <button @click=${() => setCount((v: number) => v + 1)}>+</button>
  `;
});
```

### createWS() — WebSocket reaktif

WebSocket dengan auto-reconnect, status signal, data auto JSON parse.

```typescript
import { createWS } from "@sanify/core";

type Message = { text: string; ts: number };

const ws = createWS<Message>("wss://echo.websocket.org", {
  reconnectDelay: 2000,
  maxRetries: 10,
});

// ws.data()   — signal: data terbaru (auto JSON parse)
// ws.status() — signal: "connecting" | "open" | "closed" | "reconnecting"
// ws.error()  — signal: error terakhir (null saat connected)
// ws.send(x)  — kirim (auto JSON.stringify)
// ws.close()  — tutup permanen

component("x-chat", () => {
  return () => html`
    <p>Status: ${() => ws.status()}</p>
    ${() => {
      const msg = ws.data();
      return msg ? html`<p>${msg.text}</p>` : null;
    }}
  `;
});
```

`doMount()` membungkus render dalam effect. Setiap signal berubah → DOM di-clear + re-render. Child owner di-dispose sebelum render baru.

### Template optimizations (v0.5.3+)

- **Same strings skip**: kalau `bindChild` dapat TemplateResult dengan `strings` yang sama → skip re-render
- **TextNode in-place**: nilai primitif update `nodeValue` tanpa bongkar DOM
- **TransitionGroup FLIP**: reorder dianimasikan posisinya

### Error handling

- `ErrorBoundary` directive — tangkap error di subtree
- `onError(handler)` — global fallback
- `findErrorHandler(owner)` — traverse rantai owner

## Reactivity internals

### Signal lifecycle
```
signal(initial) → [get, set]
  get() → subscribe currentObserver
  set(next) → Object.is check → schedule(subscribers) → microtask flush
```

### Effect lifecycle
```
effect(fn) → new Effect(fn) → run()
  run() → dispose(false) → run cleanups → track new deps
  dispose(true) → run cleanups → remove from deps → mark disposed
```

### Owner tree
```
Owner → parent/children → dispose cascade
  effect() → owner.add(dispose)
  onCleanup() → owner.add(cleanup) | effect.addCleanup(cleanup)
  createRoot() → isolate scope, return dispose function
```

## File referensi

- `AGENTS.md` — panduan lengkap arsitektur, konvensi, utang teknis
- `CHANGELOG.md` — riwayat perubahan per versi
- `packages/core/test/` — 161 test di 22 file
