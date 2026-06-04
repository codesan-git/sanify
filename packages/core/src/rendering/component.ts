// component.ts — definisi Web Component, props (atribut + property), auto-dispose.
// Setup disimpan di registry yang bisa ditukar → mendukung HMR: re-registrasi
// tag menukar setup dan me-remount instance hidup (custom element tak bisa
// di-redefine, jadi indirection ini wajib).

import { createOwner, runWithOwner, signal, findErrorHandler, type Getter, type Setter } from "../reactivity/signal.ts";
import { render, type TemplateResult } from "./template.ts";

export interface ComponentContext<P> {
  props: { [K in keyof P]: Getter<P[K]> };
  el: HTMLElement;
}

type SetupFn<P> = (ctx: ComponentContext<P>) => () => TemplateResult;
type AnySetup = (ctx: ComponentContext<Record<string, unknown>>) => () => TemplateResult;

// Shortcut converter bawaan: tinggal tulis nama, tidak perlu fungsi.
// Pilihan disesuaikan dengan kebutuhan paling umum dari atribut HTML.
//   "string"  → null saat absen, string apa adanya saat ada
//   "number"  → NaN saat absen, Number(raw) selainnya
//   "boolean" → presence-based: absen (null) = false, ada = true (HTML convention)
//   "json"    → null saat absen/kosong, JSON.parse(raw) selainnya (throws bila JSON rusak)
export type AttrConverter = "string" | "number" | "boolean" | "json";

const BUILT_IN_CONVERTERS: Record<AttrConverter, (raw: string | null) => unknown> = {
  string: (raw) => raw,
  number: (raw) => (raw === null ? NaN : Number(raw)),
  boolean: (raw) => raw !== null,
  json: (raw) => (raw === null || raw === "" ? null : JSON.parse(raw)),
};

function resolveConverter(
  spec: unknown,
): (raw: string | null) => unknown {
  if (typeof spec === "function") return spec as (raw: string | null) => unknown;
  if (typeof spec === "string" && spec in BUILT_IN_CONVERTERS) {
    return BUILT_IN_CONVERTERS[spec as AttrConverter];
  }
  throw new Error(
    `attrs: nilai harus fungsi (raw) => T atau salah satu dari ${Object.keys(
      BUILT_IN_CONVERTERS,
    ).join("/")}`,
  );
}

function resolveAttrDefs(
  raw: Record<string, unknown>,
): Record<string, (raw: string | null) => unknown> {
  const out: Record<string, (raw: string | null) => unknown> = {};
  for (const key of Object.keys(raw)) {
    out[key] = resolveConverter(raw[key]);
  }
  return out;
}

export interface ComponentOptions<P> {
  // Converter atribut: nama bawaan ("string"/"number"/"boolean"/"json") untuk
  // kasus umum, atau fungsi (raw: string | null) => P[K] untuk yang khusus.
  attrs?: { [K in keyof P]?: ((raw: string | null) => P[K]) | AttrConverter };
  props?: (keyof P)[];
}

interface Host extends HTMLElement {
  __remount(): void;
}

interface Registry {
  setup: AnySetup;
  attrDefs: Record<string, (raw: string | null) => unknown>;
  attrNames: string[];
  propNames: string[];
  allNames: string[];
  instances: Set<Host>;
}

const registries = new Map<string, Registry>();

export function component<P = Record<string, never>>(
  tag: string,
  setup: SetupFn<P>,
  options: ComponentOptions<P> = {},
): void {
  const existing = registries.get(tag);
  if (existing) {
    // Re-registrasi (HMR): tukar setup + converter, lalu remount instance hidup.
    // Konfigurasi attr/prop (observedAttributes) tetap dari definisi pertama.
    existing.setup = setup as unknown as AnySetup;
    existing.attrDefs = resolveAttrDefs(
      (options.attrs ?? {}) as Record<string, unknown>,
    );
    for (const el of existing.instances) el.__remount();
    return;
  }

  const attrDefs = resolveAttrDefs(
    (options.attrs ?? {}) as Record<string, unknown>,
  );
  const attrNames = Object.keys(attrDefs);
  const propNames = (options.props ?? []) as string[];
  const allNames = [...new Set([...attrNames, ...propNames])];

  const reg: Registry = {
    setup: setup as unknown as AnySetup,
    attrDefs,
    attrNames,
    propNames,
    allNames,
    instances: new Set(),
  };
  registries.set(tag, reg);

  class SanifyElement extends HTMLElement implements Host {
    static observedAttributes = attrNames;

    private owner = createOwner();
    private sig: Record<string, [Getter<unknown>, Setter<unknown>]> = {};
    private mounted = false;
    private pendingDispose = false;

    constructor() {
      super();
      for (const name of reg.allNames) {
        this.sig[name] = signal<unknown>(undefined);
      }
      for (const name of reg.propNames) {
        this.upgradeProperty(name);
      }
    }

    // Properti yang diset SEBELUM elemen di-upgrade menjadi own data property
    // dan akan menutupi accessor. Selamatkan nilainya, pasang accessor, lalu set
    // ulang lewat setter agar nilainya masuk ke signal.
    private upgradeProperty(name: string): void {
      const self = this as unknown as Record<string, unknown>;
      let pending: unknown;
      let hasPending = false;
      if (Object.prototype.hasOwnProperty.call(this, name)) {
        pending = self[name];
        hasPending = true;
        delete self[name];
      }
      Object.defineProperty(this, name, {
        get: () => this.sig[name]![0](),
        set: (v) => this.sig[name]![1](() => v),
        configurable: true,
        enumerable: true,
      });
      if (hasPending) self[name] = pending;
    }

    private doMount(): void {
      for (const name of reg.attrNames) {
        const conv = reg.attrDefs[name]!;
        this.sig[name]![1](() => conv(this.getAttribute(name)));
      }
      const props = {} as ComponentContext<Record<string, unknown>>["props"];
      for (const name of reg.allNames) {
        (props as Record<string, unknown>)[name] = this.sig[name]![0];
      }
      try {
        runWithOwner(this.owner, () => {
          const view = reg.setup({ props, el: this });
          render(view(), this);
        });
      } catch (err) {
        // Error saat mount diteruskan ke ErrorBoundary terdekat (lewat rantai
        // owner). connectedCallback berjalan saat append, jadi ini satu-satunya
        // titik tangkap untuk error render komponen anak.
        const handler = findErrorHandler(this.owner);
        if (handler) handler(err);
        else throw err;
      }
    }

    // Dipanggil saat HMR: buang efek lama, bersihkan DOM, jalankan setup baru.
    // Nilai prop dipertahankan; state lokal di dalam setup ter-reset.
    __remount(): void {
      this.owner.dispose();
      this.owner = createOwner();
      this.replaceChildren();
      this.doMount();
    }

    connectedCallback(): void {
      // Reconnect karena dipindah (mis. reorder keyed list): batalkan disposal
      // yang tertunda, pertahankan DOM + state apa adanya — JANGAN render ulang.
      if (this.pendingDispose) {
        this.pendingDispose = false;
        return;
      }
      if (this.mounted) return;
      this.mounted = true;
      reg.instances.add(this);
      this.doMount();
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      const conv = reg.attrDefs[name];
      if (conv) this.sig[name]![1](() => conv(value));
    }

    disconnectedCallback(): void {
      // Tunda disposal: kalau ini sekadar pemindahan DOM, connectedCallback akan
      // membatalkannya dalam task yang sama. Hanya benar-benar dispose bila tetap
      // terlepas setelah microtask.
      this.pendingDispose = true;
      queueMicrotask(() => {
        if (!this.pendingDispose) return;
        this.pendingDispose = false;
        this.owner.dispose();
        this.mounted = false;
        reg.instances.delete(this);
      });
    }
  }

  if (!customElements.get(tag)) {
    customElements.define(tag, SanifyElement);
  }
}
