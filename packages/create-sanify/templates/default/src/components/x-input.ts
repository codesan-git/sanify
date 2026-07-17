// components/x-input.ts — text input dengan label, error, placeholder
//
// Usage:
//   const [val, setVal] = signal("");
//   const [err, setErr] = signal("");
//
//   <x-input
//     label="Email"
//     type="email"
//     .value=${val}
//     .error=${err}
//     placeholder="nama@email.com"
//   ></x-input>

import { component, html } from "@sanify/core";

component<{
  label: string;
  type: string;
  value: string;
  error: string;
  placeholder: string;
}>(
  "x-input",
  ({ props, el }) => {
    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement;
      (el as unknown as Record<string, unknown>).value = target.value;
      el.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    };

    return () => html`
      <div class="x-input ${() => props.error() ? "x-input--error" : ""}">
        ${props.label() ? html`
          <label class="x-input__label">${() => props.label()}</label>
        ` : null}
        <input
          class="x-input__field"
          type=${() => props.type() || "text"}
          .value=${() => props.value()}
          placeholder=${() => props.placeholder()}
          @input=${handleInput}
        />
        ${() => props.error() ? html`
          <p class="x-input__error">${() => props.error()}</p>
        ` : null}
      </div>
    `;
  },
  { props: ["label", "type", "value", "error", "placeholder"] },
);
