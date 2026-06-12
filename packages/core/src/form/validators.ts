// validators.ts — primitif validator minimal untuk createForm. Tidak punya
// transform, union, atau composer — sengaja: 85% kebutuhan form
// (required/type/min/max/pattern/custom) ditutup dengan API tipis. Untuk
// kasus lebih kompleks, user bawa Zod/Valibot sendiri lewat `validate` manual.
// Async validation didukung lewat fieldValidators/asyncFieldValidators di form.

import type { Errors } from "./form.ts";

type Result = string | undefined;
export type FieldValidator = (value: unknown) => Result;
export type AsyncFieldValidator = (value: unknown) => Promise<Result>;

// Override pesan error per-rule (atau satu string untuk semua rule field ini).
type StringMsg = string | Partial<Record<"required" | "min" | "max" | "pattern" | "type", string>>;
type NumberMsg = string | Partial<Record<"required" | "min" | "max" | "integer" | "type", string>>;

export interface StringOptions {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  message?: StringMsg;
}

export interface NumberOptions {
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  message?: NumberMsg;
}

export interface BooleanOptions {
  required?: boolean;
  message?: string;
}

// Sub-set dari StringOptions: pattern di-hardcode ke regex email, jadi
// tidak ikut di-expose.
export interface EmailOptions {
  required?: boolean;
  min?: number;
  max?: number;
  message?: StringMsg;
}

// Pola "umum": ada bagian sebelum @, satu @, bagian setelah @, sebuah titik,
// dan bagian setelah titik. Tidak menerima whitespace atau @ ganda. BUKAN
// validasi RFC 5322 ketat — untuk itu user pakai Zod/Valibot. Tapi pas untuk
// 99% form web (intuitif: alamat email harus terlihat seperti a@b.c).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Treat undefined/null/"" sebagai "kosong" — sesuai konvensi form HTML.
// 0 dan false TIDAK dianggap kosong supaya number=0 dan checkbox=false valid.
function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

function pickMsg(
  msg: StringMsg | NumberMsg | undefined,
  key: string,
  fallback: string,
): string {
  if (typeof msg === "string") return msg;
  if (msg && typeof msg === "object") {
    const m = (msg as Record<string, string>)[key];
    if (m) return m;
  }
  return fallback;
}

function string(opts: StringOptions = {}): FieldValidator {
  return (value) => {
    if (isEmpty(value)) {
      return opts.required ? pickMsg(opts.message, "required", "required") : undefined;
    }
    if (typeof value !== "string") return pickMsg(opts.message, "type", "must be a string");
    if (opts.min !== undefined && value.length < opts.min) {
      return pickMsg(opts.message, "min", `must be at least ${opts.min} characters`);
    }
    if (opts.max !== undefined && value.length > opts.max) {
      return pickMsg(opts.message, "max", `must be at most ${opts.max} characters`);
    }
    if (opts.pattern && !opts.pattern.test(value)) {
      return pickMsg(opts.message, "pattern", "invalid format");
    }
    return undefined;
  };
}

function number(opts: NumberOptions = {}): FieldValidator {
  return (value) => {
    if (isEmpty(value)) {
      return opts.required ? pickMsg(opts.message, "required", "required") : undefined;
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      return pickMsg(opts.message, "type", "must be a number");
    }
    if (opts.integer && !Number.isInteger(value)) {
      return pickMsg(opts.message, "integer", "must be an integer");
    }
    if (opts.min !== undefined && value < opts.min) {
      return pickMsg(opts.message, "min", `must be at least ${opts.min}`);
    }
    if (opts.max !== undefined && value > opts.max) {
      return pickMsg(opts.message, "max", `must be at most ${opts.max}`);
    }
    return undefined;
  };
}

function boolean(opts: BooleanOptions = {}): FieldValidator {
  return (value) => {
    if (isEmpty(value)) return opts.required ? opts.message ?? "required" : undefined;
    if (typeof value !== "boolean") return opts.message ?? "must be a boolean";
    return undefined;
  };
}

// Escape hatch: predicate user-defined. Return `true`/`undefined` = lolos,
// `false` = pesan default "invalid", string = pesan error.
function custom<T = unknown>(
  fn: (value: T) => boolean | string | undefined,
): FieldValidator {
  return (value) => {
    const r = fn(value as T);
    if (r === true || r === undefined) return undefined;
    if (r === false) return "invalid";
    return r;
  };
}

// Email = string + regex email + pesan default "invalid email" untuk rule
// pattern. Override pesan via opts.message tetap berlaku seperti v.string.
function email(opts: EmailOptions = {}): FieldValidator {
  const message: StringMsg | undefined =
    typeof opts.message === "string"
      ? opts.message
      : { pattern: "invalid email", ...(opts.message ?? {}) };
  return string({
    required: opts.required,
    min: opts.min,
    max: opts.max,
    pattern: EMAIL_RE,
    message,
  });
}

export const validators = { string, number, boolean, custom, email };

// Hasil schema(): callable sebagai validate, plus .fields untuk field-level.
export type SchemaResult<T extends Record<string, unknown>> = ((
  values: T,
) => Errors<T>) & { fields: Partial<Record<keyof T, FieldValidator>> };

// Bangun fungsi `validate` yang dipasang ke createForm. Tiap key di `shape`
// menjalankan validator-nya pada field bernama sama; error pertama per field
// dikumpulkan ke Errors<T>. Properti `.fields` bisa dipakai createForm untuk
// validasi per-field (blur/input) tanpa menjalankan semua validator.
export function schema<T extends Record<string, unknown>>(
  shape: Partial<Record<keyof T, FieldValidator>>,
): SchemaResult<T> {
  const fn = (values: T): Errors<T> => {
    const errors = {} as Errors<T>;
    for (const key in shape) {
      const validator = shape[key];
      if (!validator) continue;
      const err = validator((values as Record<string, unknown>)[key]);
      if (err !== undefined) (errors as Record<string, string>)[key] = err;
    }
    return errors;
  };
  (fn as unknown as { fields: typeof shape }).fields = shape;
  return fn as SchemaResult<T>;
}
