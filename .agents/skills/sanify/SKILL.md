---
name: sanify
description: Panduan untuk bekerja dengan Sanify Frontend framework — Web Components reaktif fine-grained tanpa virtual DOM. Gunakan saat mengedit, menambah fitur, debugging, atau review code di project Sanify.
---

# Sanify Framework Skill

Framework frontend fine-grained berbasis Web Components asli. Komponen jalan **sekali**, reactivity **fine-grained** (signal nempel langsung ke node DOM), **tanpa virtual DOM** dan **tanpa diffing global**. Gaya SolidJS, ringan (~22 KB gzip npm, ~67 KB bundle).

## Kapan pakai skill ini

- Menambah fitur baru ke `@sanify/core` (`packages/core/src/`)
- Debug reactivity, template, atau router
- Review code sebelum publish
- Update `create-sanify` scaffolder
- Jawab pertanyaan user tentang arsitektur Sanify

## Aturan utama (jangan dilanggar)

1. **Semua turunan dari `signal.ts`.** Kalau ragu menambah mesin baru, tanyakan: apakah cukup dengan signal + effect?
2. **Komponen jalan SEKALI.** Setup `component(tag, setup)` dieksekusi satu kali. Return value = view function yang reaktif.
3. **Fine-grained, bukan re-render.** Satu binding = satu effect yang menyentuh satu node. Jangan diffing menyeluruh.
4. **Light DOM, BUKAN Shadow DOM.** Keputusan sadar agar Tailwind jalan global.
5. **Bahasa**: README & dokumentasi pakai bahasa Inggris. Komentar kode (`.ts`) pakai bahasa Indonesia.
6. **JANGAN publish npm tanpa diminta eksplisit.** Build, test, typecheck, edit `package.json` boleh; publish hanya saat user minta.

## Tooling

| Perintah | Kegunaan |
|----------|----------|
| `bun test` | Jalankan semua test (161 test, 22 file) |
| `bun run typecheck` | TypeScript `--noEmit` |
| `bun run build` | Bundle JS ke `dist/index.js` |
| `bun run build:types` | Emit `.d.ts` lewat `tsc` |

**PENTING**: `--target=browser` baca `dist/index.js`, BUKAN `src/index.ts`. Setiap ubah source, WAJIB `bun run build`.

## Arsitektur module

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
│   └── router.ts      — History API, nested routes, loader, guard, lazy
├── resource/
│   ├── resource.ts    — fetch with cache, dedupe, SWR, polling, retry, Suspense
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

### DoMount effect wrapper

Mulai v0.5.3, `doMount()` membungkus render dalam effect. Setiap signal berubah → DOM di-clear + re-render. Child owner di-dispose sebelum render baru.

### Template optimizations (v0.5.3+)

- **Same strings skip**: kalau `bindChild` dapat TemplateResult dengan `strings` yang sama → skip re-render, binding existing tetap jalan
- **TextNode in-place**: nilai primitif update `nodeValue` tanpa bongkar DOM
- **TransitionGroup FLIP**: reorder dianimasikan posisinya

### Error handling

- `ErrorBoundary` directive — tangkap error di subtree
- `onError(handler)` — global fallback untuk error yang lolos semua boundary
- `findErrorHandler(owner)` — traverse rantai owner cari errorHandler terdekat

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

### Batching
- `set()` → `schedule(effect)` → `pendingEffects.add` → microtask `flush()`
- `batch(fn)` → `batchDepth++` → execute → `batchDepth--` → `flush()`
- Beberapa `set()` dalam satu tick otomatis di-batch

### Owner tree
```
Owner → parent/children → dispose cascade
  effect() → owner.add(dispose)
  onCleanup() → owner.add(cleanup) | effect.addCleanup(cleanup)
  createRoot() → isolate scope, return dispose function
```

## Tips development

1. **Test reactivity**: test pakai `bun test`, assert setelah `batch(() => {})` untuk flush effect.
2. **Test DOM**: butuh `happy-dom` (via `setup-dom.ts`), DOM-related test di file terpisah.
3. **Check memory**: `__debug.enable()` → `__debug.stats()` lihat signal/effect count.
4. **ErrorBoundary di test**: error dalam effect di-route ke ErrorBoundary, buat dummy ErrorBoundary untuk assert error handling.
5. **Router test**: `navigate()` sinkron, `batch()` flush, `await Promise.resolve()` untuk redirect dari guard.

## File referensi

- `AGENTS.md` — panduan lengkap arsitektur, konvensi, utang teknis
- `CHANGELOG.md` — riwayat perubahan per versi
- `packages/core/test/` — 161 test di 22 file, referensi terbaik untuk perilaku yang diharapkan
