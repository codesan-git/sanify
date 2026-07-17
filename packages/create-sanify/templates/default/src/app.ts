// app.ts — root komponen + router

import { component, html, router } from "@sanify/core";
import "./components/nav-bar.ts";
import "./components/x-toast.ts";
import "./pages/home-page.ts";
import "./pages/demo-page.ts";
import "./pages/advanced-page.ts";

component("app-root", () => {
  const view = router({
    "/": () => html`<home-page></home-page>`,
    "/demo": () => html`<demo-page></demo-page>`,
    "/advanced": () => html`<advanced-page></advanced-page>`,
    "*": () => html`
      <div class="page">
        <div class="card stack">
          <p class="muted">Halaman tidak ditemukan.</p>
          <a data-link href="/">Beranda</a>
        </div>
      </div>
    `,
  });

  return () => html`
    <nav-bar></nav-bar>
    <main>${view}</main>
    <x-toast></x-toast>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
