// pages/demo-page.ts — showcase: signal, resource, x-select, modal, x-input, x-checkbox, x-table, x-toast

import { component, html, signal, resource, Transition } from "@sanify/core";
import { users, fetchProfile } from "../data/users.ts";
import "../components/x-select.ts";
import "../components/x-input.ts";
import "../components/x-checkbox.ts";
import "../components/x-table.ts";
import { showToast } from "../components/x-toast.ts";

component("demo-page", () => {
  const [count, setCount] = signal(0);

  const [selectedId, setSelectedId] = signal(users[0]!.id);
  const profile = resource(() => fetchProfile(selectedId()));

  // ── x-select ──
  const [selectVal, setSelectVal] = signal("a");
  const selectOptions = [
    { value: "a", label: "Opsi A" },
    { value: "b", label: "Opsi B" },
    { value: "c", label: "Opsi C" },
  ];

  // ── modal ──
  const [modalOpen, setModalOpen] = signal(false);

  // ── x-input + x-checkbox ──
  const [nameVal, setNameVal] = signal("");
  const [emailVal, setEmailVal] = signal("");
  const [emailErr, setEmailErr] = signal("");
  const [agree, setAgree] = signal(false);

  const handleSubmit = () => {
    if (!emailVal().includes("@")) {
      setEmailErr("Email tidak valid");
      return;
    }
    setEmailErr("");
    showToast(`Tersimpan: ${nameVal() || "-"} — ${emailVal()}`, "success");
  };

  // ── x-table ──
  const tableColumns = [
    { key: "name", label: "Nama", sortable: true },
    { key: "role", label: "Peran", sortable: true },
    { key: "status", label: "Status" },
  ];
  const tableRows = signal([
    { name: "Satria", role: "Developer", status: "Aktif" },
    { name: "Budi", role: "Designer", status: "Aktif" },
    { name: "Citra", role: "PM", status: "Cuti" },
    { name: "Dian", role: "Developer", status: "Nonaktif" },
  ]);

  return () => html`
    <div class="page stack">
      <!-- Signal fine-grained -->
      <div class="card stack">
        <h2>Signal fine-grained</h2>
        <p class="muted">
          Hanya node yang menyimpan nilai yang diperbarui — komponen tidak di-render ulang.
        </p>
        <div class="cluster">
          <button class="btn btn--ghost" @click=${() => setCount((n) => n - 1)}>−</button>
          <strong>${() => count()}</strong>
          <button class="btn btn--primary" @click=${() => setCount((n) => n + 1)}>+</button>
          <button class="btn btn--ghost" @click=${() => setCount(0)}>Reset</button>
        </div>
      </div>

      <!-- x-input + x-checkbox + x-toast -->
      <div class="card stack">
        <h2>x-input + x-checkbox + toast</h2>
        <p class="muted">
          Form input dengan label, error state, dan checkbox. Submit akan memicu toast.
        </p>
        <x-input
          label="Nama"
          .value=${nameVal}
          placeholder="Masukkan nama"
          @change=${(e: Event) => setNameVal((e.target as HTMLInputElement).value)}
        ></x-input>
        <x-input
          label="Email"
          type="email"
          .value=${emailVal}
          .error=${emailErr}
          placeholder="nama@email.com"
          @change=${(e: Event) => setEmailVal((e.target as HTMLInputElement).value)}
        ></x-input>
        <x-checkbox
          label="Setuju dengan syarat & ketentuan"
          .checked=${agree}
          @change=${(e: Event) => setAgree((e.target as HTMLInputElement).checked)}
        ></x-checkbox>
        <button class="btn btn--primary" @click=${handleSubmit}>Simpan & Tampilkan Toast</button>
      </div>

      <!-- x-select -->
      <div class="card stack">
        <h2>x-select</h2>
        <p class="muted">
          Dropdown select dengan pencarian otomatis (muncul saat > 8 opsi). Binding dua arah lewat <code>.value</code>.
        </p>
        <x-select
          .options=${selectOptions}
          .value=${selectVal}
          placeholder="Pilih opsi..."
          @change=${(e: Event) => setSelectVal((e.target as HTMLSelectElement).value)}
        ></x-select>
        <p class="muted">Nilai: <strong>${() => selectVal()}</strong></p>
      </div>

      <!-- Modal -->
      <div class="card stack">
        <h2>Modal</h2>
        <p class="muted">
          Modal dengan backdrop, Escape key. Bungkus dengan <code>Transition</code> untuk animasi enter/leave.
        </p>
        <button class="btn btn--primary" @click=${() => setModalOpen(true)}>Buka Modal</button>

        ${Transition("modal", () => {
          return modalOpen() ? html`
            <div class="modal" role="dialog" aria-modal="true">
              <div class="modal__backdrop" @click=${() => setModalOpen(false)}></div>
              <div class="modal__panel">
                <div class="modal__header">
                  <h2 class="modal__title">Konfirmasi</h2>
                  <button class="btn btn--ghost" @click=${() => setModalOpen(false)} aria-label="Tutup">✕</button>
                </div>
                <div class="modal__body">
                  <p>Ini konten modal. Klik backdrop atau tekan <kbd>Esc</kbd> untuk menutup.</p>
                </div>
                <div class="modal__footer">
                  <button class="btn btn--ghost" @click=${() => setModalOpen(false)}>Batal</button>
                  <button class="btn btn--primary" @click=${() => { setModalOpen(false); showToast("Dikonfirmasi!", "success"); }}>Ya</button>
                </div>
              </div>
            </div>
          ` : null;
        }, { duration: 200 })}
      </div>

      <!-- x-table -->
      <div class="card stack">
        <h2>x-table</h2>
        <p class="muted">
          Tabel data dengan sorting kolom. Klik header kolom untuk sort ascending/descending.
        </p>
        <x-table .columns=${tableColumns} .rows=${tableRows[0]()}></x-table>
      </div>

      <!-- Resource async -->
      <div class="card stack">
        <h2>Resource async</h2>
        <p class="muted">
          resource() refetch otomatis saat sinyal sumber berubah, dengan loading dan error state bawaan.
        </p>
        <div class="cluster">
          ${users.map((u) => html`
            <button
              class=${() => selectedId() === u.id ? "btn btn--primary" : "btn btn--ghost"}
              @click=${() => setSelectedId(u.id)}
            >${u.name}</button>
          `)}
        </div>
        ${() => profile.loading() ? html`<p class="loading-text">Memuat…</p>` : null}
        ${() => profile.error()   ? html`<p class="error-text">${String(profile.error())}</p>` : null}
        ${() => {
          const p = profile.data();
          return p ? html`
            <div>
              <strong>${p.name}</strong>
              <p class="muted">${p.email}</p>
            </div>
          ` : null;
        }}
      </div>
    </div>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
