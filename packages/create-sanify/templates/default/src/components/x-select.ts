// components/x-select.ts — dropdown select dengan signal binding
//
// Usage:
//   <x-select
//     .options=${[{value: "a", label: "Option A"}, ...]}
//     .value=${sel}
//     placeholder="Pilih..."
//   ></x-select>
//
//   const [sel, setSel] = signal("a");
//   return () => html`<x-select .options=${opts} .value=${sel}></x-select>`;
//
//   // sel() akan sync dua arah: berubah saat user pilih, dan komponen
//   // update saat signal diset dari luar.

import { component, html, signal, onCleanup } from "@sanify/core";

export interface SelectOption {
  value: string;
  label: string;
}

component<{
  options: SelectOption[];
  value: string;
  placeholder: string;
}>(
  "x-select",
  ({ props, el }) => {
    const [open, setOpen] = signal(false);
    const [search, setSearch] = signal("");

    const selectedLabel = () => {
      const opt = props.options().find((o) => o.value === props.value());
      return opt?.label ?? props.placeholder() ?? "Pilih...";
    };

    const filtered = () => {
      const s = search().toLowerCase();
      if (!s) return props.options();
      return props.options().filter(
        (o) => o.label.toLowerCase().includes(s),
      );
    };

    const select = (value: string) => {
      (el as unknown as Record<string, unknown>).value = value;
      el.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      setOpen(false);
      setSearch("");
    };

    const toggle = () => setOpen((v) => !v);

    // Tutup dropdown saat klik di luar
    const handleOutside = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    onCleanup(() => {
      document.removeEventListener("click", handleOutside);
      document.removeEventListener("keydown", handleKey);
    });

    return () => {
      if (open()) {
        document.addEventListener("click", handleOutside);
        document.addEventListener("keydown", handleKey);
      }

      return html`
        <div class="x-select ${() => open() ? "x-select--open" : ""}">
          <button
            class="x-select__trigger"
            type="button"
            @click=${toggle}
            aria-expanded=${() => open()}
            aria-haspopup="listbox"
          >
            <span class=${() => props.value() ? "" : "muted"}>
              ${selectedLabel}
            </span>
            <svg class="x-select__chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          ${() => open() ? html`
            <div class="x-select__dropdown" role="listbox">
              ${props.options().length > 8 ? html`
                <input
                  class="x-select__search"
                  type="text"
                  placeholder="Cari..."
                  .value=${search}
                  @input=${(e: Event) => setSearch((e.target as HTMLInputElement).value)}
                  @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
                />
              ` : null}
              <div class="x-select__list">
                ${() => filtered().map((opt) => html`
                  <button
                    class=${"x-select__option" + (props.value() === opt.value ? " x-select__option--active" : "")}
                    type="button"
                    role="option"
                    aria-selected=${props.value() === opt.value}
                    @click=${() => select(opt.value)}
                  >${opt.label}</button>
                `)}
                ${() => filtered().length === 0 ? html`
                  <div class="x-select__empty muted">Tidak ditemukan</div>
                ` : null}
              </div>
            </div>
          ` : null}
        </div>
      `;
    };
  },
  { props: ["options", "value", "placeholder"] },
);

if (import.meta.hot) import.meta.hot.accept();
