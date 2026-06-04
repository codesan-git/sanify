// components/nav-bar.ts — navigasi atas (SPA link via data-link)

import { component, html, current } from "@sanify/core";

const links = [
  { href: "/",     label: "Home" },
  { href: "/demo", label: "Demo" },
];

component("nav-bar", () => {
  const isActive = (href: string) =>
    href === "/" ? current() === "/" : current().startsWith(href);

  return () => html`
    <nav class="nav">
      <div class="nav__inner">
        <span class="nav__brand">Sanify</span>
        ${links.map((l) => html`
          <a
            data-link
            href=${l.href}
            class=${() => isActive(l.href) ? "nav__link nav__link--active" : "nav__link"}
          >${l.label}</a>
        `)}
      </div>
    </nav>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
