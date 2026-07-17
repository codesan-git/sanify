// pages/home-page.ts — intro framework + link ke dokumentasi

import { component, html } from "@sanify/core";

component("home-page", () => {
  return () => html`
    <div class="page">
      <div class="card stack">
        <h1>Sanify</h1>
        <p class="muted">
          Framework reaktif fine-grained berbasis Web Components — sinyal langsung
          ke node DOM, tanpa virtual DOM, tanpa diffing global.
        </p>
        <ul class="stack">
          <li>Signal fine-grained: hanya node yang bergantung yang diperbarui</li>
          <li>Web Components asli, Light DOM — styling global tetap berjalan</li>
          <li>Router bawaan dengan nested routes dan outlet reaktif</li>
          <li>Resource async: loading, error, dan data sebagai sinyal</li>
        </ul>
        <div class="cluster">
                  <a class="btn btn--primary" href="/demo" data-link>Coba Demo</a>
                  <a class="btn btn--ghost" href="/advanced" data-link>Advanced</a>
                  <a class="btn btn--ghost" href="https://sanify.dev/docs" target="_blank" rel="noopener">Dokumentasi</a>
                </div>
      </div>
    </div>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
