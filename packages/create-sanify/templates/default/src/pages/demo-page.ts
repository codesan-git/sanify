// pages/demo-page.ts — demo signal fine-grained + resource async

import { component, html, signal, resource } from "@sanify/core";
import { users, fetchProfile } from "../data/users.ts";

component("demo-page", () => {
  const [count, setCount] = signal(0);

  const [selectedId, setSelectedId] = signal(users[0]!.id);
  const profile = resource(() => fetchProfile(selectedId()));

  return () => html`
    <div class="page stack">
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
