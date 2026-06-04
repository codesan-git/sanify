# Form

Source: `packages/core/src/form/form.ts`

A thin form primitive built on top of `createStore` + `signal`. Two-way binding is **explicit** (you spread `form.register(name)` into each input you want bound), and validation runs **only on submit** by default — opt into `"blur"` or `"input"` if you want earlier feedback.

## API


| Export            | Signature              | Purpose                                                                                                  |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `createForm`      | `<T>(opts) => Form<T>` | Build a form with reactive values, errors, touched, submit lifecycle                                     |
| `Form<T>`         | type                   | `{ values, errors, touched, submitting, submitCount, isValid, register, handleSubmit, setField, reset }` |
| `FormOptions<T>`  | type                   | `{ initialValues, validate?, onSubmit, validateOn? }`                                                    |
| `FieldProps`      | type                   | What `register()` returns — pass it as a spread to an input                                              |
| `ValidateTrigger` | type                   | `"submit" | "blur" | "input"`                                                                            |


## Basic usage

```ts
import { createForm, html, render, Show } from "@sanify/core";

const form = createForm({
  initialValues: { email: "", password: "" },
  validate: (v) => {
    const e: Record<string, string> = {};
    if (!v.email.includes("@")) e.email = "invalid email";
    if (v.password.length < 6) e.password = "password too short";
    return e;
  },
  onSubmit: async (values) => {
    await api.login(values);
  },
});

render(
  html`
    <form @submit=${form.handleSubmit}>
      <input ${form.register("email")} placeholder="email" />
      ${Show(
        () => form.errors.email,
        () => html`<p class="err">${() => form.errors.email}</p>`,
      )}

      <input type="password" ${form.register("password")} placeholder="password" />
      ${Show(
        () => form.errors.password,
        () => html`<p class="err">${() => form.errors.password}</p>`,
      )}

      <button disabled=${() => form.submitting()}>
        ${() => (form.submitting() ? "submitting..." : "log in")}
      </button>
    </form>
  `,
  document.body,
);
```

## What `register(name)` returns

```ts
form.register("email") // → FieldProps
// {
//   name: "email",
//   ".value": () => form.values.email,
//   "@input": (e) => { form.values.email = e.target.value (or .checked / .valueAsNumber) },
//   "@blur": () => { form.touched.email = true; (maybe validate) },
// }
```

The spread syntax (`<input ${form.register("email")} />`) installs four bindings in one go: the `name` attribute, a reactive `.value` property, and two listeners. The input's `value` reflects `form.values[name]`, and typing updates the store via `@input`. The `@input` reader handles three native input types automatically:


| `input.type`  | Value taken from       |
| ------------- | ---------------------- |
| `checkbox`    | `target.checked`       |
| `number`      | `target.valueAsNumber` |
| anything else | `target.value`         |


Anything more exotic (file inputs, custom widgets) you write the handler yourself with `setField`.

## State you can read


| Field         | Reactive                         | Notes                                                                         |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `values`      | yes (per leaf via `createStore`) | The current field values; read or assign directly (`form.values.email = "x"`) |
| `errors`      | yes (per leaf via `createStore`) | Populated by `validate()`; cleared keys disappear                             |
| `touched`     | yes (per leaf via `createStore`) | Flipped to `true` on first `@blur` of each field                              |
| `submitting`  | `Getter<boolean>`                | `true` while `onSubmit` is running                                            |
| `submitCount` | `Getter<number>`                 | Total submit attempts (incremented even on invalid submit)                    |
| `isValid`     | `Getter<boolean>`                | `Object.keys(errors).length === 0`; reactive without microtask delay          |


## Validation triggers

```ts
createForm({
  ...,
  validateOn: "submit",  // default — validate only when handleSubmit fires
  // validateOn: "blur",  // also validate when a field is blurred
  // validateOn: "input", // also validate on every keystroke
});
```

`validate(values)` must be synchronous and return a `Partial<Record<keyof T, string>>`. An empty object means valid. To express "no error for this field", omit the key.

For async validation (e.g. "is this username taken?"), run it inside `onSubmit` and throw — or mutate `form.errors` directly on the response. Async-while-typing is intentionally out of scope; it would either need debouncing built in (more magic) or surprise users with stale errors.

### Show errors only for touched fields

`validate(values)` always runs against **all** fields — that's deliberate so cross-field rules like `password === confirmPassword` can be expressed. The consequence: as soon as one field is blurred (with `validateOn: "blur"`), every invalid field appears in `form.errors`, even ones the user hasn't touched yet.

Filter at the UI layer using `form.touched` and `form.submitCount`:

```ts
const errFor = (field: keyof T): string | undefined => {
  if (form.submitCount() === 0 && !form.touched[field]) return undefined;
  return form.errors[field];
};

// In the template:
${() => {
  const err = errFor("email");
  return err ? html`<p class="err">${err}</p>` : null;
}}
```

This is the same pattern React Hook Form (`formState.touchedFields[field] && formState.errors[field]`), Formik (`touched[field] && errors[field]`), and Final Form (`meta.touched && meta.error`) use.

## Built-in validators

Writing `validate` by hand for every form is fine for small cases. For repetitive shapes, `@sanify/core` ships a tiny declarative validator that covers ~85% of typical form needs (`required`, type, min/max, regex, custom predicate). It is **not** a Zod replacement — no async, no transforms, no unions, no composition. For richer schemas, plug in Zod/Valibot manually in `validate`.

```ts
import { createForm, schema, validators as v } from "@sanify/core";

const form = createForm({
  initialValues: { email: "", password: "", age: 0, agree: false },
  validate: schema({
    email: v.email({ required: true }),
    password: v.string({ required: true, min: 8 }),
    age: v.number({ required: true, min: 18, integer: true }),
    agree: v.custom<boolean>((val) => val === true || "you must agree"),
  }),
  onSubmit: ...,
});
```

### Field validators

| Validator | Options | Notes |
| --- | --- | --- |
| `v.string({ required?, min?, max?, pattern?, message? })` | length checks + regex | Empty (`""`/null/undefined) skips other checks unless `required` |
| `v.email({ required?, min?, max?, message? })` | length + email shape | `v.string` with a baked-in email regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Common case, not RFC 5322 strict |
| `v.number({ required?, min?, max?, integer?, message? })` | range + integer | `0` is a valid number, not "empty" |
| `v.boolean({ required?, message? })` | type | `false` is a valid boolean, not "empty" |
| `v.custom<T>(fn)` | predicate | Return `true`/`undefined` = ok; `false` = generic `"invalid"`; `string` = error message |

### Empty value convention

`undefined`, `null`, and `""` are treated as "empty" (matches HTML form semantics). `0` and `false` are **not** considered empty — required number/boolean validators won't reject them. Use `v.custom` if you need stricter rules ("must be > 0", "must be checked").

### Custom messages

Override the default message globally for a field, or per rule:

```ts
v.string({ required: true, min: 3, message: "field is invalid" });           // one message for all rules
v.string({ required: true, min: 3, message: { required: "wajib diisi" } }); // per-rule override; others fall back
```

### `schema(shape)` builder

```ts
schema<T>({ field: validator, ... }) => (values: T) => Errors<T>
```

Runs each validator against the corresponding field; collects the first error per field into the returned error map. Fields without a validator are skipped (the shape is `Partial<Record<keyof T, FieldValidator>>`). The returned function is exactly the shape `createForm`'s `validate` option expects.

### When to reach for Zod/Valibot instead

Stay with `v.*` if your forms only need the rules in the table above. Use Zod/Valibot (manually plugged into `validate`) when you need:

- Async validation (uniqueness, server-side check)
- Transformations (`"5"` → `5`, trim, lowercase)
- Unions / discriminated unions / refinements
- Nested object schemas
- Sharing the same schema between client and server (single source of truth)

```ts
// Manual Zod plug
import { z } from "zod";
const Schema = z.object({ email: z.string().email() });

const form = createForm({
  ...,
  validate: (v) => {
    const r = Schema.safeParse(v);
    if (r.success) return {};
    return Object.fromEntries(
      r.error.issues.map((i) => [String(i.path[0]), i.message]),
    );
  },
});
```

## Submitting

```ts
const form = createForm({
  ...,
  onSubmit: async (values) => {
    const res = await fetch("/api/login", { method: "POST", body: JSON.stringify(values) });
    if (!res.ok) throw new Error("login failed");
  },
});
```

Lifecycle when `form.handleSubmit(e?)` is called:

1. `e?.preventDefault()` — the native form submit is suppressed.
2. `submitCount` is incremented.
3. `validate(values)` runs; if it returns any errors, `**onSubmit` is not called**.
4. If valid: `submitting()` flips to `true`, `onSubmit(values)` is invoked.
5. When the returned promise settles (resolve OR reject), `submitting()` flips back to `false`.

Errors thrown from `onSubmit` are **swallowed** so the form doesn't crash. Surface them however you want — set `form.errors` from inside `onSubmit`, show a toast, or wrap your own try/catch.

## Direct mutation, like everywhere else

Following the same convention as `createStore`, prefer direct assignment:

```ts
form.values.email = "satria@example.com"; // updates the store leaf
form.errors.email = "set externally";     // can be assigned from outside (e.g. server response)
form.touched.email = true;                // also direct
```

`form.setField("email", "x")` exists for symmetry with the input handler but offers nothing extra over direct assignment.

## `reset(next?)`

```ts
form.reset();                       // back to initialValues
form.reset({ email: "preserved" }); // merge with initialValues, override the named keys
```

Wipes errors, touched, and submitCount; restores values to `initialValues` (or that merged with `next`).

## Mental model

> A form is `createStore(values) + createStore(errors) + createStore(touched) + signal(submitting) + signal(submitCount)`. `register(name)` is just a helper that produces a `FieldProps` object — perfect for the new spread attribute syntax. There's no two-way binding magic and no auto-validation: the form does exactly what its options say, and nothing else.

## Pitfalls


| Symptom                           | Cause                                                                             | Fix                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Input doesn't update when typing  | Forgot to spread `${form.register("name")}` — the `@input` handler isn't attached | Use the spread                                                                               |
| `form.values.x` stays `undefined` | `name` doesn't match the `initialValues` key                                      | The keys must match exactly — `register("emial")` won't populate `values.email`              |
| Error doesn't clear after fix     | `validate` still returns the error key                                            | Remove the key from the returned object (or return `{}` when fully valid)                    |
| `submitting` stuck on `true`      | `onSubmit` returns a promise that never settles                                   | Make sure your async chain resolves or rejects — `setSubmitting(false)` only fires on settle |
| Want to clear field on submit     | Call `form.reset()` inside `onSubmit` after success                               | —                                                                                            |


