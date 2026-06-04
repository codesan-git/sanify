// test/form.test.ts — createForm: register, validate trigger, submit lifecycle
import { test, expect } from "bun:test";
import "./setup-dom.ts";

const { createForm, html, render, batch } = await import("../src/index.ts");

function mount(tr: ReturnType<typeof html>) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  render(tr, c);
  return c;
}

test("createForm: register memasang value & @input ke input, sinkron ke values", () => {
  const form = createForm({
    initialValues: { email: "" },
    onSubmit: () => {},
  });

  const c = mount(html`<input ${form.register("email")} />`);
  const input = c.querySelector("input")!;
  expect(input.name).toBe("email");
  expect(input.value).toBe(""); // initial

  input.value = "x@y";
  input.dispatchEvent(new Event("input"));
  expect(form.values.email).toBe("x@y");

  // Update store langsung → reflect ke .value prop input.
  form.values.email = "set@here";
  batch(() => {});
  expect(input.value).toBe("set@here");
});

test("createForm: validate default jalan saat submit, errors terisi & onSubmit di-skip", () => {
  let submitted: unknown = null;
  const form = createForm({
    initialValues: { email: "", password: "" },
    validate: (v) => {
      const e: Record<string, string> = {};
      if (!v.email.includes("@")) e.email = "invalid email";
      if (v.password.length < 6) e.password = "too short";
      return e;
    },
    onSubmit: (v) => {
      submitted = v;
    },
  });

  form.handleSubmit();
  expect(form.errors.email).toBe("invalid email");
  expect(form.errors.password).toBe("too short");
  expect(form.isValid()).toBe(false);
  expect(submitted).toBeNull(); // tidak dipanggil

  form.values.email = "a@b.com";
  form.values.password = "secret123";
  form.handleSubmit();
  expect(form.errors.email).toBeUndefined();
  expect(form.errors.password).toBeUndefined();
  expect(form.isValid()).toBe(true);
  expect(submitted).toEqual({ email: "a@b.com", password: "secret123" });
});

test("createForm: validateOn 'blur' memvalidasi saat field di-blur", () => {
  const form = createForm({
    initialValues: { name: "" },
    validate: (v) => (v.name ? {} : { name: "required" }),
    onSubmit: () => {},
    validateOn: "blur",
  });

  const c = mount(html`<input ${form.register("name")} />`);
  const input = c.querySelector("input")!;

  // Belum di-blur → belum ada error.
  expect(form.errors.name).toBeUndefined();
  expect(form.touched.name).toBeUndefined();

  input.dispatchEvent(new Event("blur"));
  expect(form.touched.name).toBe(true);
  expect(form.errors.name).toBe("required");
});

test("createForm: validateOn 'input' memvalidasi tiap keystroke", () => {
  const form = createForm({
    initialValues: { n: "" },
    validate: (v) => (v.n.length >= 3 ? {} : { n: "min 3" }),
    onSubmit: () => {},
    validateOn: "input",
  });

  const c = mount(html`<input ${form.register("n")} />`);
  const input = c.querySelector("input")!;

  input.value = "ab";
  input.dispatchEvent(new Event("input"));
  expect(form.errors.n).toBe("min 3");

  input.value = "abc";
  input.dispatchEvent(new Event("input"));
  expect(form.errors.n).toBeUndefined();
});

test("createForm: submitting() true selama onSubmit async berjalan", async () => {
  let resolve!: () => void;
  const p = new Promise<void>((r) => (resolve = r));

  const form = createForm({
    initialValues: { x: 1 },
    onSubmit: async () => p,
  });

  expect(form.submitting()).toBe(false);
  form.handleSubmit();
  expect(form.submitting()).toBe(true);

  resolve();
  // Tunggu sampai seluruh microtask drain (Promise.resolve chain di handleSubmit).
  await new Promise((r) => setTimeout(r, 0));
  expect(form.submitting()).toBe(false);
});

test("createForm: reset() mengembalikan values & menghapus errors/touched", () => {
  const form = createForm({
    initialValues: { a: 1, b: "x" },
    validate: () => ({ a: "err" }),
    onSubmit: () => {},
  });

  form.values.a = 99;
  form.values.b = "y";
  form.touched.a = true;
  form.handleSubmit(); // populates errors
  expect(form.errors.a).toBe("err");

  form.reset();
  expect(form.values.a).toBe(1);
  expect(form.values.b).toBe("x");
  expect(form.errors.a).toBeUndefined();
  expect(form.touched.a).toBeUndefined();
  expect(form.submitCount()).toBe(0);
});

test("createForm: checkbox & number input dikenali tipenya di register @input", () => {
  const form = createForm({
    initialValues: { agree: false, age: 0 },
    onSubmit: () => {},
  });
  const c = mount(html`
    <input type="checkbox" ${form.register("agree")} />
    <input type="number" ${form.register("age")} />
  `);
  const [chk, num] = c.querySelectorAll("input") as unknown as [
    HTMLInputElement,
    HTMLInputElement,
  ];

  chk.checked = true;
  chk.dispatchEvent(new Event("input"));
  expect(form.values.agree).toBe(true);

  num.value = "42";
  num.dispatchEvent(new Event("input"));
  expect(form.values.age).toBe(42);
});

test("createForm: handleSubmit preventDefault saat dipanggil dari event form", () => {
  const form = createForm({ initialValues: {}, onSubmit: () => {} });
  let prevented = false;
  const fakeEvent = {
    preventDefault: () => {
      prevented = true;
    },
  } as unknown as Event;
  form.handleSubmit(fakeEvent);
  expect(prevented).toBe(true);
});
