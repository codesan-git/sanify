// components/x-checkbox.ts — checkbox dengan label
//
// Usage:
//   const [checked, setChecked] = signal(false);
//
//   <x-checkbox
//     label="Setuju dengan syarat & ketentuan"
//     .checked=${checked}
//   ></x-checkbox>

import { component, html } from "@sanify/core";

component<{ label: string; checked: boolean }>(
  "x-checkbox",
  ({ props, el }) => {
    const toggle = () => {
      const next = !props.checked();
      (el as unknown as Record<string, unknown>).checked = next;
      el.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    };

    return () => html`
      <label class="x-checkbox ${() => props.checked() ? "x-checkbox--checked" : ""}">
        <span class="x-checkbox__box" aria-hidden="true">
          ${() => props.checked() ? html`
            <svg viewBox="0 0 20 20" width="14" height="14">
              <path d="M4 10l4 4 8-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          ` : null}
        </span>
        <input
          class="x-checkbox__input"
          type="checkbox"
          .checked=${() => props.checked()}
          @change=${toggle}
        />
        <span class="x-checkbox__label">${() => props.label()}</span>
      </label>
    `;
  },
  { props: ["label", "checked"] },
);
