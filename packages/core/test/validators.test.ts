// test/validators.test.ts — validator primitives + schema builder + integrasi createForm
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { validators: v, schema, createForm } = await import("../src/index.ts");

// ── string ──────────────────────────────────────────────────
test("v.string: required vs optional", () => {
  expect(v.string({ required: true })("")).toBe("required");
  expect(v.string({ required: true })(undefined)).toBe("required");
  expect(v.string({ required: true })(null)).toBe("required");
  expect(v.string({ required: true })("hi")).toBeUndefined();

  expect(v.string()("")).toBeUndefined(); // kosong + optional → lolos
  expect(v.string()(undefined)).toBeUndefined();
});

test("v.string: min/max/pattern", () => {
  const validator = v.string({ min: 3, max: 5, pattern: /^[a-z]+$/ });
  expect(validator("ab")).toBe("must be at least 3 characters");
  expect(validator("abcdef")).toBe("must be at most 5 characters");
  expect(validator("Abc")).toBe("invalid format");
  expect(validator("abcd")).toBeUndefined();
});

test("v.string: type check menolak non-string", () => {
  expect(v.string()(123)).toBe("must be a string");
});

test("v.string: pesan kustom (per-rule & global)", () => {
  const perRule = v.string({ required: true, min: 3, message: { min: "kependekan" } });
  expect(perRule("")).toBe("required"); // pakai default
  expect(perRule("a")).toBe("kependekan");

  const global = v.string({ required: true, min: 3, message: "kosong/pendek" });
  expect(global("")).toBe("kosong/pendek");
  expect(global("a")).toBe("kosong/pendek");
});

// ── number ──────────────────────────────────────────────────
test("v.number: required + type + range + integer", () => {
  expect(v.number({ required: true })(undefined)).toBe("required");
  expect(v.number({ required: true })(0)).toBeUndefined(); // 0 valid, bukan kosong
  expect(v.number()("5")).toBe("must be a number");
  expect(v.number()(NaN)).toBe("must be a number");

  const rng = v.number({ min: 18, max: 150 });
  expect(rng(17)).toBe("must be at least 18");
  expect(rng(200)).toBe("must be at most 150");
  expect(rng(25)).toBeUndefined();

  const int = v.number({ integer: true });
  expect(int(3.5)).toBe("must be an integer");
  expect(int(3)).toBeUndefined();
});

// ── boolean ─────────────────────────────────────────────────
test("v.boolean: required + type", () => {
  expect(v.boolean({ required: true })(undefined)).toBe("required");
  expect(v.boolean({ required: true })(false)).toBeUndefined(); // false valid, bukan kosong
  expect(v.boolean()("x")).toBe("must be a boolean");
  expect(v.boolean()(true)).toBeUndefined();
});

// ── email ───────────────────────────────────────────────────
test("v.email: terima format umum, tolak yang salah", () => {
  const e = v.email();
  // Empty + optional → lolos.
  expect(e("")).toBeUndefined();

  // Lolos.
  for (const ok of [
    "user@example.com",
    "first.last@example.co.id",
    "user+tag@sub.example.com",
    "u@a.b",
    "_underscore@x.io",
  ]) {
    expect(e(ok)).toBeUndefined();
  }

  // Tolak — pesan default "invalid email".
  for (const bad of ["plainstring", "no-at.com", "missing@dot", "@nouser.com", "spaces in@email.com"]) {
    expect(e(bad)).toBe("invalid email");
  }
});

test("v.email: required + min/max ikut ke pipeline string", () => {
  const e = v.email({ required: true, max: 30 });
  expect(e("")).toBe("required");
  expect(e("a@b.c")).toBeUndefined();
  expect(e("very.long.email.address@example.com")).toBe("must be at most 30 characters");
});

test("v.email: pesan kustom override", () => {
  const perRule = v.email({ message: { pattern: "format email salah" } });
  expect(perRule("nope")).toBe("format email salah");

  const global = v.email({ required: true, message: "isi email yang benar" });
  expect(global("")).toBe("isi email yang benar");
  expect(global("x")).toBe("isi email yang benar");
});

// ── custom ──────────────────────────────────────────────────
test("v.custom: true/undefined lolos, false → 'invalid', string → pesan kustom", () => {
  const eq42 = v.custom<number>((n) => n === 42);
  expect(eq42(42)).toBeUndefined();
  expect(eq42(7)).toBe("invalid");

  const msg = v.custom<string>((s) => s.length > 0 || "tidak boleh kosong");
  expect(msg("hi")).toBeUndefined();
  expect(msg("")).toBe("tidak boleh kosong");

  // return undefined eksplisit juga dianggap lolos
  const noop = v.custom(() => undefined);
  expect(noop("anything")).toBeUndefined();
});

// ── schema ──────────────────────────────────────────────────
test("schema: kombinasi field, hanya error pertama per field", () => {
  const validate = schema<{ email: string; age: number }>({
    email: v.string({ required: true, pattern: /^\S+@\S+\.\S+$/ }),
    age: v.number({ required: true, min: 18 }),
  });

  expect(validate({ email: "", age: 0 })).toEqual({
    email: "required",
    age: "must be at least 18",
  });
  expect(validate({ email: "x", age: 10 })).toEqual({
    email: "invalid format",
    age: "must be at least 18",
  });
  expect(validate({ email: "a@b.c", age: 25 })).toEqual({});
});

test("schema: integrasi createForm — validate dipakai apa adanya", () => {
  let submitted: unknown = null;
  const form = createForm<{ email: string; age: number }>({
    initialValues: { email: "", age: 0 },
    validate: schema({
      email: v.string({ required: true, pattern: /^\S+@\S+\.\S+$/ }),
      age: v.number({ required: true, min: 18 }),
    }),
    onSubmit: (vals) => {
      submitted = vals;
    },
  });

  form.handleSubmit();
  expect(form.errors.email).toBe("required");
  expect(form.errors.age).toBe("must be at least 18");
  expect(submitted).toBeNull();

  form.values.email = "a@b.c";
  form.values.age = 25;
  form.handleSubmit();
  expect(form.isValid()).toBe(true);
  expect(submitted).toEqual({ email: "a@b.c", age: 25 });
});

test("schema: field tanpa validator dilewatkan (Partial)", () => {
  const validate = schema<{ a: string; b: string }>({
    a: v.string({ required: true }),
    // b sengaja dilewatkan
  });
  expect(validate({ a: "", b: "anything" })).toEqual({ a: "required" });
});
