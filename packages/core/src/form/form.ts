// form.ts — form primitive tipis di atas createStore + signal. Tidak ada
// dua-arah ajaib; user secara eksplisit memasang `register(name)` ke input.
// Validasi default hanya saat submit; opt-in ke "blur" / "input".
// Field-level: hanya validasi field yang berubah saat blur/input.
// Async validation didukung lewat asyncFieldValidators (per-field).

import { signal, type Getter } from "../reactivity/signal.ts";
import { createStore } from "../store/reactive.ts";
import {
  type FieldValidator,
  type AsyncFieldValidator,
} from "./validators.ts";

type Values = Record<string, unknown>;
export type Errors<T> = Partial<Record<keyof T, string>>;

export type ValidateTrigger = "submit" | "blur" | "input";

export interface FormOptions<T extends Values> {
  initialValues: T;
  // Validator form penuh: dipanggil saat submit (dan blur/input bila tidak
  // ada fieldValidators). Kembalikan map error — empty object berarti valid.
  validate?: (values: T) => Errors<T>;
  // Per-field validator sinkron. Bila diset, blur/input hanya menjalankan
  // validator untuk field yang bersangkutan, bukan seluruh form.
  // Submit tetap menjalankan validate() (atau semua fieldValidators).
  fieldValidators?: Partial<Record<keyof T, FieldValidator>>;
  // Per-field validator async. Dijalankan saat blur (atau input, dengan race
  // protection). Error dari async validator ditulis ke errors store.
  asyncFieldValidators?: Partial<Record<keyof T, AsyncFieldValidator>>;
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
  // True saat ada async validation yang sedang berjalan.
  validating: Getter<boolean>;
  submitCount: Getter<number>;
  isValid: Getter<boolean>;
  register: <K extends keyof T & string>(name: K) => FieldProps;
  handleSubmit: (e?: Event) => void | Promise<void>;
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
  const initial = { ...opts.initialValues };
  const [values] = createStore<T>({ ...opts.initialValues });
  const [errors] = createStore<Errors<T>>({} as Errors<T>);
  const [touched] = createStore<Partial<Record<keyof T, boolean>>>({});
  const [submitting, setSubmitting] = signal(false);
  const [submitCount, setSubmitCount] = signal(0);
  const [validating, setValidating] = signal(false);

  let asyncRunning = 0;
  const incAsync = (): void => {
    if (asyncRunning++ === 0) setValidating(true);
  };
  const decAsync = (): void => {
    if (--asyncRunning === 0) setValidating(false);
  };

  const trigger = opts.validateOn ?? "submit";
  const hasField = opts.fieldValidators !== undefined;

  // Gabungan field validator: dari fieldValidators eksplisit, atau
  // diekstrak dari validate bila itu SchemaResult (punya .fields).
  let fields: Partial<Record<keyof T, FieldValidator>> =
    opts.fieldValidators ?? {};
  if (!opts.fieldValidators && opts.validate) {
    const maybe = opts.validate as unknown as { fields?: unknown };
    if (maybe.fields !== undefined && typeof maybe.fields === "object") {
      fields = maybe.fields as Partial<Record<keyof T, FieldValidator>>;
    }
  }

  const validateOne = <K extends keyof T>(
    name: K,
  ): string | undefined => {
    const validator = (fields as Record<string, FieldValidator | undefined>)[
      name as string
    ];
    if (!validator) return undefined;
    return validator((values as Record<string, unknown>)[name as string]);
  };

  const setFieldError = (name: string, err: string | undefined): void => {
    const e = errors as Record<string, string | undefined>;
    if (err === undefined) {
      delete e[name];
    } else {
      e[name] = err;
    }
  };

  // Jalankan validator penuh (sync). Submit selalu memanggil ini.
  const runValidate = (): boolean => {
    let next: Errors<T>;
    if (opts.validate) {
      next = opts.validate(values);
    } else if (hasField) {
      next = {} as Errors<T>;
      const v = values as Record<string, unknown>;
      for (const key in fields) {
        const err = (fields as Record<string, FieldValidator>)[key]!(v[key]);
        if (err !== undefined) (next as Record<string, string>)[key] = err;
      }
    } else {
      return true;
    }
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

  // Jalankan async validator untuk satu field. Error ditulis ke errors store.
  const runAsyncOne = <K extends keyof T>(name: K): void => {
    const validator = opts.asyncFieldValidators?.[name];
    if (!validator) return;
    incAsync();
    validator((values as Record<string, unknown>)[name as string]).then(
      (err) => {
        setFieldError(name as string, err);
        decAsync();
      },
      () => {
        decAsync();
      },
    );
  };

  // Bukan computed: getter sinkron yang membaca struktur store secara reaktif
  // (Object.keys melewati `ownKeys` trap → langganan structure signal).
  const isValid: Getter<boolean> = () => Object.keys(errors).length === 0;

  const setField = <K extends keyof T>(name: K, value: T[K]): void => {
    (values as T)[name] = value;
    if (trigger === "input") {
      if (hasField || (fields as Record<string, unknown>)[name as string] !== undefined) {
        setFieldError(name as string, validateOne(name));
      } else {
        runValidate();
      }
    }
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
      if (trigger === "blur") {
        if (hasField || (fields as Record<string, unknown>)[name as string] !== undefined) {
          setFieldError(name as string, validateOne(name as keyof T));
        } else {
          runValidate();
        }
      }
      runAsyncOne(name as keyof T);
    },
  });

  const handleSubmit = async (e?: Event): Promise<void> => {
    e?.preventDefault?.();
    setSubmitCount((n) => n + 1);
    const ok = runValidate();
    if (asyncRunning > 0) {
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (asyncRunning === 0) resolve();
          else setTimeout(check, 10);
        };
        check();
      });
    }
    if (!isValid()) return;
    if (!ok) return;
    setSubmitting(true);
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
    validating,
    submitCount,
    isValid,
    register,
    handleSubmit,
    setField,
    reset,
  };
}
