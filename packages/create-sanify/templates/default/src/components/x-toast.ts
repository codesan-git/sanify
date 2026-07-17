// components/x-toast.ts — container notifikasi auto-dismiss
//
// Usage:
//   <x-toast></x-toast>   ← tempatkan sekali di app-root
//
//   // Panggil dari komponen mana saja:
//   import { showToast } from "./x-toast.ts";
//   showToast("Berhasil disimpan!", "success");
//   showToast("Gagal menghapus data.", "error");
//   showToast("Memperbarui...", "info");
//
//   Toast otomatis hilang setelah 4 detik (success/info) atau 6 detik (error).

import { component, html, signal, batch } from "@sanify/core";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 1;
const [toasts, setToasts] = signal<Toast[]>([]);

/** Tampilkan toast. Dipanggil dari komponen mana saja. */
export function showToast(message: string, type: ToastType = "info"): void {
  const id = nextId++;
  const duration = type === "error" ? 6000 : 4000;

  batch(() => {
    setToasts((prev) => [...prev, { id, message, type }]);
  });

  setTimeout(() => dismissToast(id), duration);
}

function dismissToast(id: number): void {
  batch(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  });
}

component("x-toast", () => {
  return () => html`
    <div class="x-toast-container" aria-live="polite">
      ${() => toasts().map((t) => html`
        <div
          class=${"x-toast x-toast--" + t.type + " x-toast--enter"}
          role="status"
        >
          <span>${t.message}</span>
          <button
            class="x-toast__close"
            aria-label="Tutup"
            @click=${() => dismissToast(t.id)}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      `)}
    </div>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
