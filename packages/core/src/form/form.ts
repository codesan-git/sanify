// form.ts — form primitive tipis di atas createStore + signal. Tidak ada
// dua-arah ajaib; user secara eksplisit memasang `register(name)` ke input.
// Validasi default hanya saat submit; opt-in ke "blur" / "input".

import { signal, type Getter } from "../reactivity/signal.ts";
import { createStore } from "../store/reactive.ts";

type Values = Record<string, unknown>;
export type Errors<T> = Partial<Record<keyof T, string>>;

export type ValidateTrigger = "submit" | "blur" | "input";

export interface FormOptions<T extends Values> {
  initialValues: T;
  // Validator sinkron: kembalikan map error (key = field name). Empty object
  // berarti valid. Async validation di luar scope v1 — bungkus di onSubmit.
  validate?: (values: T) => Errors<T>;
  // Dipanggil saat submit dan tidak ada error. Boleh async; `submitting()`
  // akan tetap true sampai promise selesai.
  onSubmit: (values: T) => void | Promise<void>;
  // Kapan validate() dipanggil otomatis. Default "submit". "blur" menambah
  // validasi saat field di-blur; "input" menambah setiap keystroke.
  validateOn?: ValidateTrigger;
}

export interface FieldProps {
  name: string;
  ".value": Getter<unknown>;
  "@input": (e: Event) => void;
  "@blur": () => void;
}

export interface Form<T extends Values> {
  values: T;
  errors: Errors<T>;
  touched: Partial<Record<keyof T, boolean>>;
  submitting: Getter<boolean>;
  submitCount: Getter<number>;
  isValid: Getter<boolean>;
  register: <K extends keyof T & string>(name: K) => FieldProps;
  handleSubmit: (e?: Event) => void;
  setField: <K extends keyof T>(name: K, value: T[K]) => void;
  reset: (next?: Partial<T>) => void;
}

function readField(target: EventTarget | null): unknown {
  if (!target) return undefined;
  const el = target as HTMLInputElement;
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number") return el.valueAsNumber;
  return el.value;
}

export function createForm<T extends Values>(opts: FormOptions<T>): Form<T> {
  // Snapshot initialValues supaya reset() bisa kembali ke kondisi awal.
  const initial = { ...opts.initialValues };
  const [values] = createStore<T>({ ...opts.initialValues });
  const [errors] = createStore<Errors<T>>({} as Errors<T>);
  const [touched] = createStore<Partial<Record<keyof T, boolean>>>({});
  const [submitting, setSubmitting] = signal(false);
  const [submitCount, setSubmitCount] = signal(0);

  const trigger = opts.validateOn ?? "submit";

  // Jalankan validator sekali; tulis ke `errors` store. Mengembalikan true
  // bila tidak ada error.
  const runValidate = (): boolean => {
    if (!opts.validate) return true;
    const next = opts.validate(values);
    // Sinkronkan errors store: hapus key yang tidak ada di next, tulis yang ada.
    const e = errors as Record<string, string | undefined>;
    for (const k of Object.keys(e)) {
      if (!(k in next)) delete e[k];
    }
    const n = next as Record<string, string | undefined>;
    for (const k of Object.keys(n)) {
      if (n[k] !== undefined) e[k] = n[k];
    }
    return Object.keys(next).length === 0;
  };

  // Bukan computed: getter sinkron yang membaca struktur store secara reaktif
  // (Object.keys melewati `ownKeys` trap → langganan structure signal).
  // Ini memungkinkan handleSubmit() konsumen membaca status valid LANGSUNG
  // setelah validate() tanpa menunggu microtask flush.
  const isValid: Getter<boolean> = () => Object.keys(errors).length === 0;

  const setField = <K extends keyof T>(name: K, value: T[K]): void => {
    (values as T)[name] = value;
    if (trigger === "input") runValidate();
  };

  const register = <K extends keyof T & string>(name: K): FieldProps => ({
    name,
    ".value": () => (values as Record<string, unknown>)[name],
    "@input": (e: Event) => {
      const v = readField(e.target) as T[K];
      setField(name as K, v);
    },
    "@blur": () => {
      (touched as Record<string, boolean>)[name] = true;
      if (trigger === "blur") runValidate();
    },
  });

  const handleSubmit = (e?: Event): void => {
    e?.preventDefault?.();
    setSubmitCount((n) => n + 1);
    const ok = runValidate();
    if (!ok) return;
    setSubmitting(true);
    // User error-handling adalah tanggung jawab onSubmit; di sini cukup flip
    // flag submitting kembali. Satu .then dua handler = satu microtask.
    Promise.resolve(opts.onSubmit(values)).then(
      () => setSubmitting(false),
      () => setSubmitting(false),
    );
  };

  const reset = (next?: Partial<T>): void => {
    const target = next ? { ...initial, ...next } : initial;
    const v = values as Record<string, unknown>;
    for (const k of Object.keys(v)) {
      if (!(k in target)) delete v[k];
    }
    for (const k of Object.keys(target)) {
      v[k] = (target as Record<string, unknown>)[k];
    }
    const e = errors as Record<string, unknown>;
    for (const k of Object.keys(e)) delete e[k];
    const t = touched as Record<string, unknown>;
    for (const k of Object.keys(t)) delete t[k];
    setSubmitCount(0);
  };

  return {
    values,
    errors,
    touched,
    submitting,
    submitCount,
    isValid,
    register,
    handleSubmit,
    setField,
    reset,
  };
}
