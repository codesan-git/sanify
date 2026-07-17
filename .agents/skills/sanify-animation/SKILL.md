---
name: sanify-animation
description: Panduan animasi untuk Sanify framework — Transition directive, TransitionGroup FLIP, CSS animation patterns, easing, performa. Gunakan saat menambah animasi enter/leave, transisi UI, atau animasi list di project Sanify.
---

# Sanify Animation Skill

Panduan animasi untuk aplikasi Sanify. Filosofi: **CSS-only, zero JS animation library.** Semua animasi via CSS `transition`/`animation` + class toggle, atau lewat directive `Transition` / `TransitionGroup` bawaan framework.

## Filosofi

1. **CSS, bukan JS.** Animasi pakai `transition` dan `@keyframes`. Tidak ada dependency GSAP, Framer Motion, atau library animasi JS lain.
2. **Compositor-only.** Hanya animasikan `transform` dan `opacity`. Jangan `width`, `height`, `top`, `left`, `margin` — ini trigger layout/paint, bikin jank.
3. **Reduced motion first.** Framework otomatis skip animasi saat `prefers-reduced-motion: reduce`. Jangan override.
4. **Durasi pendek.** UI animation: 100–300ms. Jangan lebih dari 500ms kecuali animasi dekoratif.

## API bawaan Sanify

### `Transition(name, children, options?)`

Bungkus konten reaktif dengan animasi CSS enter/leave.

```typescript
import { Transition, html, signal } from "@sanify/core";

const [open, setOpen] = signal(false);

return () => html`
  <button @click=${() => setOpen((v) => !v)}>Toggle</button>

  ${Transition("modal", () => {
    return open() ? html`<div class="modal">Konten</div>` : null;
  }, { appear: false, duration: 300 })}
`;
```

**Cara kerjanya:**
- `children()` return nilai baru → konten lama dapat class `${name}-leave`, lalu di-remove setelah animasi selesai.
- Konten baru dapat class `${name}-enter`, lalu class dilepas setelah animasi selesai.
- Default **tidak** animasi di mount pertama. Set `appear: true` untuk override.
- Fallback timer `duration` (default 500ms) — jaring pengaman kalau `animationend`/`transitionend` gak fire.

**Options:**

| Option | Tipe | Default | Keterangan |
|---|---|---|---|
| `duration` | `number` | `500` | Fallback timeout (ms) |
| `appear` | `boolean` | `false` | Animasi enter di mount pertama |

**Class yang ditambahkan:**
- Enter: `${name}-enter`
- Leave: `${name}-leave`

### `TransitionGroup(name, each, render, options?)`

Animasi list: enter, leave, + FLIP reorder otomatis.

```typescript
import { TransitionGroup, html, signal } from "@sanify/core";

const [items, setItems] = signal([1, 2, 3]);

return () => html`
  <button @click=${() => setItems((v) => [...v, v.length + 1])}>Tambah</button>

  ${TransitionGroup("list", items, (item, index) => {
    return html`<div class="list-item">${item} — #${index}</div>`;
  }, { key: (item) => item, duration: 300 })}
`;
```

**Cara kerjanya:**
- Item baru: dapat class `${name}-enter`, lalu animasi enter.
- Item hilang: dapat class `${name}-leave`, lalu di-remove setelah animasi selesai.
- Item pindah posisi: **FLIP animation** — framework otomatis hitung delta posisi, pasang inverse `transform`, animasikan ke identity.
- `key` wajib untuk identitas item. Default: item itu sendiri.

**Options:**

| Option | Tipe | Default | Keterangan |
|---|---|---|---|
| `key` | `(item, index) => unknown` | `(item) => item` | Key unik per item |
| `duration` | `number` | `500` | Durasi animasi (ms) |
| `appear` | `boolean` | `false` | Animasi enter di mount pertama |

**Class yang ditambahkan:**
- Enter: `${name}-enter`
- Leave: `${name}-leave`

---

## CSS animation patterns

### Modal (fade + scale)

```css
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity .15s;
}
.modal__backdrop {
  background: rgb(0 0 0/.4);
  /* backdrop juga ikut transisi */
}
.modal__panel {
  background: var(--card);
  border-radius: .75rem;
  padding: 1.5rem;
  transform: scale(.95);
  transition: transform .15s;
}

/* Enter: tampil + scale normal */
.modal-enter .modal { opacity: 1; }
.modal-enter .modal__panel { transform: scale(1); }

/* Leave: langsung ke state akhir (gak perlu explicit — transition otomatis balik) */
```

```typescript
${Transition("modal", () => {
  return open() ? html`
    <div class="modal">
      <div class="modal__backdrop" @click=${() => setOpen(false)}></div>
      <div class="modal__panel">
        <h2>Judul</h2>
        <p>Konten modal.</p>
      </div>
    </div>
  ` : null;
})}
```

**PENTING**: class `modal-enter` dipasang di **wrapper** yang di-insert Transition, bukan di elemen modal langsung. Jadi selector-nya `.modal-enter .modal` (descendant), bukan `.modal-enter.modal`.

### Dropdown / popover (fade + slide down)

```css
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: .375rem;
  box-shadow: 0 4px 12px rgb(0 0 0/.1);
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity .12s, transform .12s;
}
.dropdown-enter { opacity: 1; transform: translateY(0); }
```

### Toast / notification (slide in)

```css
.toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  transform: translateX(calc(100% + 1rem));
  transition: transform .2s ease-out;
}
.toast-enter { transform: translateX(0); }
```

### List item (fade + slide)

```css
.list-item { transition: opacity .2s, transform .2s; }

/* Item baru masuk */
.list-enter { opacity: 0; transform: translateY(-8px); }

/* Item keluar */
.list-leave { opacity: 0; transform: translateX(100%); }
```

**PENTING untuk TransitionGroup**: class enter langsung dipasang di elemen item, bukan wrapper. Jadi selector-nya `.list-enter` (elemen itu sendiri), bukan `.list-enter .list-item`.

Perbedaan dengan `Transition`:
- `Transition`: class di wrapper → selector descendant (`.name-enter .child`)
- `TransitionGroup`: class di item → selector langsung (`.name-enter`)

---

## Easing conventions

| Easing | Pakai untuk |
|---|---|
| `ease-out` / `cubic-bezier(0, 0, 0.2, 1)` | **Enter.** Mulai cepat, melambat. Default untuk elemen muncul. |
| `ease-in` / `cubic-bezier(0.4, 0, 1, 1)` | **Leave.** Mulai lambat, cepat di akhir. Elemen menghilang. |
| `ease-in-out` / `cubic-bezier(0.4, 0, 0.2, 1)` | **Loop / infinite.** Simetris. Pakai untuk spinner, skeleton. |
| `ease` (default) | Netral. Kalau ragu, ini aman. |
| `linear` | **Hindari.** Kecuali untuk infinite spinner atau progress bar. |

```css
/* Konvensi Sanify */
.modal-enter    { transition: opacity .15s ease-out; }
.modal-leave    { transition: opacity .15s ease-in; }
.spinner        { animation: spin .8s ease-in-out infinite; }
```

## Durasi

| Durasi | Kapan |
|---|---|
| `100ms` | Micro-interaction: hover, focus, tooltip |
| `150ms` | UI ringan: dropdown, toggle, checkbox |
| `200ms` | UI standar: modal, drawer, toast |
| `300ms` | UI berat: page transition, list reorder |
| `500ms+` | Dekoratif: splash screen, ilustrasi |

**Rule of thumb**: kalau animasi terasa lambat, kurangi durasi, bukan ganti easing. Kalau terasa kasar, cek easing dulu, baru naikkan durasi.

---

## Motion Design

Bagian ini menjawab **kapan, kenapa, dan dari mana** — bukan cuma bagaimana. Prinsip-prinsip di bawah memastikan animasi terasa *intentional*, bukan sekadar hiasan.

### Motion hierarchy

Ukuran elemen dan jarak tempuh menentukan durasi. Semakin besar/jauh, semakin lama — tapi tetap dalam batas 100–500ms.

| Jenis gerakan | Jarak tempuh | Durasi | Contoh |
|---|---|---|---|
| Micro | ~4px | 100–120ms | Hover, focus ring, icon toggle |
| Small | ~8–16px | 150ms | Dropdown, tooltip, chip |
| Medium | ~24–64px | 200ms | Modal, toast, drawer |
| Large | >100px / full page | 300ms | Page transition, sheet up |
| Extra large | Viewport-wide | 400–500ms | Splash, onboarding, ilustrasi |

```css
/* Micro: hanya opacity, hampir instan */
.tooltip { transition: opacity .1s ease-out; }

/* Small: sedikit pergeseran */
.dropdown { transition: opacity .12s, transform .12s ease-out; }

/* Medium: elemen muncul dari luar viewport */
.toast { transition: transform .2s ease-out; }

/* Large: transisi antar halaman */
.page { transition: opacity .3s, transform .3s ease-out; }
```

### Spatial model — dari mana elemen "datang"

Arah gerakan harus konsisten dengan posisi elemen di layout. Ini bikin animasi terasa *fisik* dan mudah dipahami.

| Pola UI | Asal | Transform enter | Transform leave |
|---|---|---|---|
| **Modal / dialog** | Tengah layar | `scale(.95)` | `scale(.95)` (kembali) |
| **Drawer / sidebar** | Kiri atau kanan | `translateX(-100%)` | `translateX(-100%)` |
| **Dropdown / popover** | Atas (dari trigger) | `translateY(-4px)` | `translateY(-4px)` |
| **Toast / notification** | Bawah kanan | `translateX(100%)` | `translateX(100%)` |
| **Tooltip** | Dekat trigger | `translateY(4px)` | `translateY(4px)` |
| **List item baru** | Atas (masuk dari atas) | `translateY(-8px)` | — |
| **List item hilang** | Kanan (keluar) | — | `translateX(100%)` |
| **Expand / collapse** | Atas (scale dari origin) | `scaleY(0)` | `scaleY(0)` |
| **Page forward** | Kanan (navigasi maju) | `translateX(24px)` | `translateX(-24px)` |
| **Page back** | Kiri (navigasi mundur) | `translateX(-24px)` | `translateX(24px)` |

**Aturan**: elemen bergerak ke arah yang masuk akal secara fisik.
- Modal tidak "jatuh dari atas" — ia muncul dari tengah (scale).
- Drawer tidak "fade" — ia slide dari samping.
- Toast tidak "scale" — ia slide dari pinggir.

### Easing personality

Easing bukan cuma soal halus — ia memberi karakter.

| Karakter | Easing | Kesan | Pakai untuk |
|---|---|---|---|
| **Ringan** | `cubic-bezier(0, 0, 0.2, 1)` (ease-out) | Cepat di awal, lembut di akhir. Profesional. | Default. Modal, dropdown, hover. |
| **Tegas** | `cubic-bezier(0.2, 0, 0, 1)` | Lebih snap dari ease-out. Sedikit bounce mental. | Tombol, toggle, switch. |
| **Playful** | `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot) | Melampaui lalu kembali. Kesan hidup & menyenangkan. | Onboarding, game UI, badge. |
| **Berat** | `cubic-bezier(0.4, 0, 0.2, 1)` (ease-in-out) | Simetris. Berat & deliberate. | Page transition, full-screen modal. |
| **Halus** | `cubic-bezier(0.4, 0, 1, 1)` (ease-in) | Melambat di awal, cepat di akhir. Seperti "menghilang". | Leave animation SAJA. |

```css
/* Konvensi Sanify untuk berbagai karakter */
:root {
  --ease-out:     cubic-bezier(0, 0, 0.2, 1);   /* default enter */
  --ease-in:      cubic-bezier(0.4, 0, 1, 1);   /* default leave */
  --ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1); /* page transition */
  --ease-snap:    cubic-bezier(0.2, 0, 0, 1);   /* toggle, switch */
  --ease-bounce:  cubic-bezier(0.34, 1.56, 0.64, 1); /* playful */
}
```

### Kapan TIDAK pakai animasi

Animasi bukan default. Ada situasi di mana animasi justru mengganggu:

| Situasi | Kenapa tidak |
|---|---|
| **Render pertama (mount)** | User belum lihat apa-apa — animasi enter tidak memberi konteks. Biarkan elemen langsung tampil. |
| **Data update non-visual** | Angka yang berubah di dashboard, timestamp, counter — animasi di sini hanya noise. |
| **User scroll cepat** | Animasi scroll-triggered harus instant kalau user scroll cepat. Jangan paksa mereka menunggu. |
| **Error state** | Error harus muncul **segera**, bukan dengan animasi 300ms. Maksimal fade 100ms. |
| **Konten berat** | Kalau render sudah lambat, jangan tambah animasi. Perbaiki performa dulu. |
| **User prefer reduced motion** | Hormati. Framework sudah handle, jangan override. |

```typescript
// ❌ Animasi di mount — user lihat animasi tanpa konteks
component("x-page", () => {
  return () => Transition("fade", () => html`<div>...</div>`, { appear: true });
});

// ✅ Mount langsung tampil — animasi hanya saat transisi antar state
component("x-page", () => {
  return () => Transition("fade", () => html`<div>...</div>`, { appear: false });
});
```

Pengecualian `appear: true`: splash screen, onboarding flow, halaman pertama setelah loading — di mana animasi adalah bagian dari *first impression*.

### Stagger — animasi cascade

Saat banyak elemen muncul bersamaan (list, grid, dashboard cards), beri jeda antar elemen agar terasa alami — bukan muncul serentak seperti pop-up.

```css
/* Stagger dengan CSS animation-delay */
.stagger-item {
  opacity: 0;
  animation: fade-in .3s ease-out forwards;
}
.stagger-item:nth-child(1) { animation-delay: 0s; }
.stagger-item:nth-child(2) { animation-delay: .05s; }
.stagger-item:nth-child(3) { animation-delay: .1s; }
.stagger-item:nth-child(4) { animation-delay: .15s; }
.stagger-item:nth-child(5) { animation-delay: .2s; }
/* ...dan seterusnya */
```

Atau dengan TransitionGroup + custom delay via inline style:

```typescript
${TransitionGroup("list", items, (item, index) => {
  return html`
    <div
      class="stagger-item"
      style=${() => `animation-delay: ${index() * 50}ms`}
    >${item.text}</div>
  `;
})}
```

**Aturan stagger**:
- Delay per item: 30–80ms. Jangan > 100ms — user tidak mau menunggu item terakhir.
- Maksimal total stagger: 300–400ms. Kalau list panjang (>10 item), batasi delay ke 5 item pertama saja.
- Enter: stagger oke. Leave: **jangan stagger** — hapus serentak agar tidak terasa lambat.

### Gesture response

Saat user berinteraksi langsung (swipe, drag, press), animasi harus instant dan mengikuti input — bukan animasi durasi tetap.

| Gesture | Respons |
|---|---|
| **Press / tap** | Scale down 2–3% (`scale(.97)`) selama ditekan. Kembali saat dilepas. Durasi: 0ms (langsung). |
| **Swipe to dismiss** | Elemen mengikuti posisi jari (pakai signal + `transform`). Saat dilepas: snap ke luar atau kembali — durasi 200ms `ease-out`. |
| **Drag to reorder** | Elemen mengikuti posisi drag. FLIP setelah drop — durasi 200ms. |
| **Pull to refresh** | Indikator mengikuti jarak pull. Saat dilepas: animasi spinner — durasi sesuai posisi. |

```css
/* Press state — langsung, tanpa transisi */
.btn:active { transform: scale(.97); }

/* Kalau pakai transition, hapus saat active */
.btn {
  transition: transform .15s ease-out; /* untuk hover */
}
.btn:active {
  transition: none; /* instant saat ditekan */
  transform: scale(.97);
}
```

### Motion consistency — aturan global

1. **Satu bahasa gerak per aplikasi.** Jangan campur fade dengan slide untuk jenis elemen yang sama. Kalau modal pakai scale+fade, semua modal harus scale+fade.
2. **Durasi konsisten per jenis.** Semua dropdown: 120ms. Semua modal: 150ms. Semua page transition: 300ms.
3. **Easing konsisten per arah.** Enter selalu `ease-out`, leave selalu `ease-in`. Jangan terbalik.
4. **Jangan animasikan dua properti dengan easing berbeda.** Kalau `opacity` & `transform` dianimasi bareng, easing-nya harus sama.
5. **Satu animasi dalam satu waktu.** Jangan timpa animasi yang sedang berjalan. Kalau user klik cepat, batalkan animasi sebelumnya.
6. **Uji dengan keyboard.** Animasi harus tetap terasa ok saat user navigasi via Tab, Enter, Escape — bukan cuma mouse/touch.

---

## Performa

### ✅ Compositor-only properties (aman)

Hanya ini yang boleh dianimasikan:

```css
/* ✅ Aman — GPU accelerated, gak trigger layout/paint */
transform: translateX(...);
transform: translateY(...);
transform: scale(...);
transform: rotate(...);
opacity: ...;
```

### ❌ Properties yang trigger layout/paint

```css
/* ❌ Trigger layout — JANGAN */
width / height
top / left / right / bottom
margin / padding
border-width

/* ❌ Trigger paint — HINDARI kalau bisa */
color / background-color
box-shadow
border-color
```

Kalau terpaksa animasi `color` atau `background-color`, ok untuk transisi pendek (100ms). Tapi jangan jadi andalan.

### Will-change

```css
/* Kasih hint ke browser untuk elemen yang sering dianimasi */
.modal__panel { will-change: transform; }
.list-item   { will-change: transform, opacity; }
```

**Jangan dipasang di semua elemen** — boros GPU memory. Hanya untuk elemen yang benar-benar sering dianimasi.

---

## Reduced motion

Framework otomatis skip animasi saat user set `prefers-reduced-motion: reduce`. Tidak perlu kode tambahan.

Kalau ada animasi dekoratif di luar `Transition`/`TransitionGroup` (mis. `@keyframes` infinite), bungkus dengan media query:

```css
@media (prefers-reduced-motion: no-preference) {
  .spinner { animation: spin .8s ease-in-out infinite; }
  .pulse   { animation: pulse 2s ease-in-out infinite; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: .5; }
}
```

---

## Kapan pakai apa

| Kebutuhan | Solusi |
|---|---|
| Satu elemen toggle (modal, dropdown, tooltip) | `Transition` directive |
| List dinamis (tambah, hapus, reorder) | `TransitionGroup` directive |
| Hover/focus effect | CSS `transition` biasa |
| Infinite animation (spinner, skeleton) | CSS `@keyframes` + `animation` |
| Page transition | `Transition` directive di root router |
| Scroll-triggered animation | CSS `@keyframes` + Intersection Observer (vanilla) |

---

## Contoh lengkap

### Modal dengan backdrop

```typescript
import { component, html, signal, Transition } from "@sanify/core";

component("x-modal-demo", () => {
  const [open, setOpen] = signal(false);

  return () => html`
    <button class="btn btn--primary" @click=${() => setOpen(true)}>
      Buka Modal
    </button>

    ${Transition("modal", () => {
      return open() ? html`
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal__backdrop" @click=${() => setOpen(false)}></div>
          <div class="modal__panel">
            <h2>Konfirmasi</h2>
            <p class="muted">Apakah Anda yakin?</p>
            <div class="cluster" style="margin-top: 1rem;">
              <button class="btn btn--primary" @click=${() => setOpen(false)}>Ya</button>
              <button class="btn btn--ghost" @click=${() => setOpen(false)}>Batal</button>
            </div>
          </div>
        </div>
      ` : null;
    }, { duration: 200 })}
  `;
});
```

```css
/* style.css */
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  opacity: 0;
  transition: opacity .15s ease-out;
}
.modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0/.4);
}
.modal__panel {
  position: relative;
  background: var(--card);
  color: var(--card-foreground);
  border-radius: .75rem;
  padding: 1.5rem;
  max-width: 24rem;
  width: 90%;
  transform: scale(.95);
  transition: transform .15s ease-out;
}

/* Enter — Transition directive pasang class "modal-enter" di wrapper */
.modal-enter { opacity: 1; }
.modal-enter .modal__panel { transform: scale(1); }

/* Leave — otomatis balik ke state awal (transition balik) */
```

### List dengan animasi

```typescript
import { component, html, signal, TransitionGroup } from "@sanify/core";

let nextId = 4;

component("x-animated-list", () => {
  const [items, setItems] = signal([
    { id: 1, text: "Belajar Sanify" },
    { id: 2, text: "Baca dokumentasi" },
    { id: 3, text: "Bangun aplikasi" },
  ]);

  const add = () => {
    setItems((v) => [...v, { id: nextId++, text: `Item ${nextId - 1}` }]);
  };

  const remove = (id: number) => {
    setItems((v) => v.filter((it) => it.id !== id));
  };

  return () => html`
    <div class="stack">
      <button class="btn btn--primary" @click=${add}>Tambah</button>
      ${TransitionGroup("list", items, (item, index) => {
        return html`
          <div class="list-item cluster">
            <span>${item.text}</span>
            <span class="muted">#${index}</span>
            <button class="btn btn--ghost" @click=${() => remove(item.id)}>Hapus</button>
          </div>
        `;
      }, { key: (item) => item.id, duration: 200 })}
    </div>
  `;
});
```

```css
.list-item {
  padding: .75rem;
  background: var(--card);
  border-radius: .5rem;
  transition: opacity .2s, transform .2s;
}

/* TransitionGroup pasang class "list-enter" langsung di elemen */
.list-enter {
  opacity: 0;
  transform: translateY(-8px);
}

.list-leave {
  opacity: 0;
  transform: translateX(100%);
}
```

---

## Anti-patterns

### ❌ Animasi lewat setInterval / requestAnimationFrame manual

```typescript
// ❌ JANGAN — animasi manual di effect
let pos = 0;
effect(() => {
  if (open()) {
    const id = setInterval(() => {
      pos += 5;
      el.style.transform = `translateY(${pos}px)`;
      if (pos >= 100) clearInterval(id);
    }, 16);
  }
});
```

Pakai CSS `transition` + class toggle, atau `Transition` directive.

### ❌ Animasi height/width

```css
/* ❌ Trigger layout — jank */
.panel { height: 0; transition: height .3s; }
.panel--open { height: 200px; }

/* ✅ Alternatif: scaleY dengan transform-origin */
.panel {
  transform: scaleY(0);
  transform-origin: top;
  transition: transform .2s;
}
.panel--open { transform: scaleY(1); }
```

### ❌ Durasi terlalu panjang

```css
/* ❌ 800ms untuk transisi UI — terasa lambat */
.modal { transition: opacity .8s; }

/* ✅ 150–300ms untuk UI */
.modal { transition: opacity .15s; }
```

### ❌ Tidak ada fallback timer

Transition directive sudah ada fallback timer bawaan. Tapi kalau pakai CSS transition manual, pastikan state bisa "selesai" meski `transitionend` gak fire:

```typescript
// ❌ Bisa stuck kalau transitionend gak fire
const [animating, setAnimating] = signal(false);

// ✅ Tambahkan setTimeout safety net
const enter = () => {
  setAnimating(true);
  setTimeout(() => setAnimating(false), 300); // safety net
};
```

### ❌ Abaikan reduced motion

Framework handle otomatis. Tapi kalau bikin animasi kustom, selalu cek:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }
}
```

---

## Keyframe snippets

### Fade in

```css
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### Slide up

```css
@keyframes slide-up {
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0);   opacity: 1; }
}
```

### Slide down

```css
@keyframes slide-down {
  from { transform: translateY(-8px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
```

### Scale in

```css
@keyframes scale-in {
  from { transform: scale(.9); opacity: 0; }
  to   { transform: scale(1);  opacity: 1; }
}
```

---

## Alur kerja animasi

1. **Tentukan kebutuhan** — toggle tunggal? List dinamis? Hover? Infinite?
2. **Pilih directive** — `Transition` untuk toggle, `TransitionGroup` untuk list, CSS `transition` untuk hover.
3. **Tulis class** — enter/leave class dengan compositor-only properties.
4. **Set easing + durasi** — ikuti konvensi di atas.
5. **Pasang di template** — gunakan `${Transition(...)}` atau `${TransitionGroup(...)}`.
6. **Review** — cek dengan reduced motion, cek di mobile (60fps), cek gak ada layout thrash.

## File referensi

- `sanify` skill — Transition/TransitionGroup API detail
- `sanify-ui` skill — class naming, design tokens untuk animasi
