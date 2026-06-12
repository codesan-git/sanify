# CLAUDE.md — Panduan untuk AI yang bekerja di proyek ini

Proyek ini adalah **Sanify Frontend** (`sanify`): framework frontend
fine-grained berbasis Web Components. Dokumen ini menjelaskan arsitektur,
konvensi, dan jebakan agar perubahan yang dibuat konsisten dengan desain.

## Apa ini, dalam satu kalimat

Framework reaktif gaya SolidJS di atas Web Components asli: komponen jalan
**sekali**, reactivity bersifat **fine-grained** (signal nempel langsung ke
node DOM), **tanpa virtual DOM** dan **tanpa diffing global**.

## Runtime & tooling

- **Bun** sebagai package manager, bundler, dev server, dan test runner.
  Bun TIDAK jalan di browser — ia hanya tooling. Yang jalan di browser adalah
  JS hasil bundling.
- **TypeScript** strict. Jalankan `bun run typecheck` sebelum menganggap selesai.
- Perintah: `bun install`, `bun dev`, `bun test`, `bun run typecheck`, `bun run build`.

## Rilis & publish (PENTING)

- **JANGAN `npm publish` atau menaikkan versi package ke npm tanpa diminta
  eksplisit.** Implementasi, build, test, typecheck, dan edit `package.json`
  yang diperlukan boleh; tapi menerbitkan ke registry (`@sanify/core`,
  `create-sanify`) hanya saat Satria memintanya secara langsung.
- Saat selesai mengerjakan fitur, cukup laporkan bahwa siap dipublish — jangan
  publish sendiri.
- **Sebelum publish, WAJIB jalankan dan pastikan hijau, dalam urutan:**
  1. `bun run typecheck`
  2. `bun test` (semua test lulus)
  3. `bun run build` (termasuk emit `.d.ts` lewat `tsc` — pastikan exit 0)

  Kalau salah satu gagal, **batalkan publish** dan perbaiki dulu. Jangan publish
  dengan test merah atau build gagal. (`prepublishOnly` menjalankan build sebagai
  jaring pengaman, tapi tetap cek manual ketiganya.)

## Reverse engineering & inspirasi

- Boleh mempelajari pola/ide dari framework lain (SolidJS, Lit, dll) lalu
  **mengimplementasi ulang dari pemahaman** — JANGAN menyalin kode sumbernya.
- Jangan menyalin blok kode, nama internal, atau struktur file mereka mentah-mentah.
- Dependency pihak ketiga: hormati lisensi; jangan vendor/embed kode berlisensi
  tanpa atribusi yang sesuai.
- Tidak mendekompilasi / reverse-engineer artefak proprietary (minified bundle
  tertutup, dll) untuk disalin.

## Prinsip arsitektur (jangan dilanggar)

1. **Semua berdiri di atas `signal.ts`.** Signal + effect fine-grained adalah
   fondasi. Template, store, resource, router semuanya hanya turunan. Kalau ragu
   menambah "mesin" baru, tanyakan dulu apakah bisa cukup dengan signal + effect.
2. **Komponen jalan sekali.** Fungsi setup `component(tag, setup)` dieksekusi
   satu kali saat mount. Fungsi yang di-return adalah view reaktif. JANGAN
   menambahkan logika yang mengasumsikan setup jalan ulang tiap render.
3. **Fine-grained, bukan re-render.** Saat menambah fitur templating, pertahankan
   model "satu binding = satu effect kecil yang menyentuh satu node". Jangan
   memperkenalkan diffing menyeluruh.
4. **Light DOM, bukan Shadow DOM.** Ini keputusan sadar agar Tailwind global
   jalan. Jangan mengubah ke Shadow DOM tanpa diskusi — itu mematahkan styling.

## Aturan penulisan template (sumber bug nomor 1)

- **Binding reaktif HARUS berupa fungsi**: tulis `${() => count()}`, BUKAN
  `${count()}`. Yang kedua dievaluasi sekali lalu kehilangan reaktivitas.
  Deteksi reaktivitas di `template.ts` berbasis `typeof value === "function"`.
- `name=${...}` → set **atribut** (selalu string).
- `.name=${...}` → set **property** (untuk objek/number/boolean ke komponen anak).
- `@event=${handler}` → pasang **event listener** (dipasang sekali, tidak dibungkus effect).
- Atribut yang diobservasi butuh konverter eksplisit:
  `component(tag, setup, { attrs: { count: (raw) => Number(raw) } })`.
- Props non-string (objek/array) lewat `props: [...]` + sintaks `.prop=${...}`.

## Lifecycle & kebocoran memori (rawan)

- Effect yang dibuat di dalam setup komponen dimiliki oleh `Owner` komponen itu,
  dan otomatis di-dispose saat `disconnectedCallback`. Mekanismenya:
  `runWithOwner(owner, () => { ...effect dibuat di sini... })`.
- Lubang dinamis (`bindChild` di `template.ts`) membuat **owner anak** tiap
  render dan men-dispose owner sebelumnya. Ini WAJIB agar effect dari nested
  template/list tidak jadi yatim. Kalau memodifikasi `bindChild`, jangan hapus
  pola owner anak ini.
- `effect()` yang mengembalikan fungsi → fungsi itu adalah cleanup, dipanggil
  sebelum run berikutnya dan saat dispose. Hanya simpan sebagai cleanup kalau
  return value benar-benar `function` (pernah ada bug: nilai non-fungsi disimpan
  lalu dipanggil → crash).

## Batching

- `set()` menjadwalkan effect via microtask, jadi update DOM bersifat **asinkron**
  (mirip React). Beberapa `set()` dalam satu tick otomatis ter-batch.
- Gunakan `batch(() => { ... })` untuk flush sinkron sekelompok perubahan.
- Di test, panggil `batch(() => {})` untuk memaksa flush sebelum assert.

## Testing

- Test inti ada di `test/signal.test.ts`. Tambahkan test saat menyentuh
  reactivity, terutama untuk: dependency dinamis, cleanup, owner dispose, batching.
- Jalankan `bun test`. Semua harus hijau sebelum selesai.
- Test berjalan di lingkungan Bun (bukan browser); kode `signal.ts` sengaja
  bebas-DOM agar bisa diuji langsung. `template.ts`/`component.ts` butuh DOM.

## Gaya kode

- TypeScript strict, hindari `any` (pakai `unknown` + cast sempit bila perlu).
- Komentar header tiap file menjelaskan perannya — pertahankan saat mengedit.
- **Bahasa**: README & semua dokumentasi (`*.md`) dalam **Bahasa Inggris**.
  Komentar di dalam kode (`.ts`) tetap **Bahasa Indonesia** (ikuti yang ada).

## Utang teknis yang DISENGAJA (jangan dianggap bug)

1. **Keyed list diffing** — `For` telah punya keyed reconciliation sejak v0.4.0.
   Item dengan key yang sama di-reuse (DOM dipertahankan, nilai di-update).
   Non-keyed list tetap dirender ulang penuh.
2. **Parser template berbasis heuristik** (`compile` di `template.ts`), bukan
   parser HTML penuh. Edge case markup tertentu bisa keliru. Kalau memperbaiki,
   tambah test, jangan ganti total tanpa diskusi.
3. **TransitionGroup reorder** belum ada FLIP animation — item dipindah di
   DOM dengan benar, tapi tanpa animasi posisi. Enter/leave sudah jalan.
4. **Reconnect komponen** membangun ulang state dari nol (tidak mempertahankan
   state lama). Aman untuk mayoritas app.

## Konteks brand

- Nama package npm: `@sanify/core` (framework) + `create-sanify` (scaffolder).
  Brand keluarga: **Sanify** (FE sekarang; backend menyusul sebagai
  `@sanify/backend` atau serupa). Author: Satria Agung Nugraha.
- Saat menambah modul, pertahankan identifier internal berprefiks `sanify`
  (mis. `__sanify`, `SanifyElement`, marker `sanify-attr-`).

## Saat ragu

Jangan menambah abstraksi atau dependency baru tanpa alasan kuat — filosofi
proyek ini "kecil, pakai yang dibutuhkan saja, semua turunan dari signal".
Kalau sebuah perubahan terasa butuh mesin baru yang besar, angkat dulu sebagai
diskusi sebelum mengimplementasi.
