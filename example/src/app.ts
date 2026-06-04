// app.ts — showcase ringkas: persisted counter, form + For + Transition,
// dan mutation latency. Tetap satu komponen supaya HMR targetnya fokus.

import {
  component,
  html,
  For,
  Transition,
  persisted,
  createForm,
  schema,
  validators as v,
  mutation,
} from "@sanify/core";

interface Todo {
  id: number;
  text: string;
}

component("app-root", () => {
  // ── persisted counter ───────────────────────────────────────
  const [count, setCount] = persisted("sanify-count", 0);

  // ── todo list + form ────────────────────────────────────────
  const [todos, setTodos] = persisted<Todo[]>("sanify-todos", []);
  let nextId = (todos().reduce((m, t) => Math.max(m, t.id), 0) ?? 0) + 1;

  const form = createForm({
    initialValues: { text: "" },
    validate: schema({
      text: v.string({ required: true, min: 2, max: 60 }),
    }),
    onSubmit: ({ text }) => {
      setTodos((cur) => [...cur, { id: nextId++, text }]);
      form.reset();
    },
  });

  const removeTodo = (id: number): void => {
    setTodos((cur) => cur.filter((t) => t.id !== id));
  };

  // ── mock async "save" (demo mutation) ───────────────────────
  const save = mutation<void, string>(async () => {
    await new Promise((r) => setTimeout(r, 700));
    if (Math.random() < 0.2) throw new Error("network blip — try again");
    return `saved at ${new Date().toLocaleTimeString()}`;
  });

  return () => html`
    <div class="bg-fx">
      <div class="blob blob--primary"></div>
      <div class="blob blob--secondary"></div>
    </div>
    <div class="page">
      <div class="card stack">
        <h1>Sanify</h1>

        <section class="stack">
          <h2 class="section">Counter (persisted)</h2>
          <div class="cluster">
            <button class="btn btn--ghost" @click=${() => setCount((n) => n - 1)}>−</button>
            <strong class="count">${() => count()}</strong>
            <button class="btn btn--primary" @click=${() => setCount((n) => n + 1)}>+</button>
            <button class="btn btn--ghost" @click=${() => setCount(0)}>Reset</button>
          </div>
          <p class="muted">Refresh — angka bertahan via <code>persisted()</code>.</p>
        </section>

        <hr class="divider" />

        <section class="stack">
          <h2 class="section">Todo (form + For + Transition)</h2>
          <form class="cluster" @submit=${form.handleSubmit}>
            <input
              class="input"
              ${form.register("text")}
              placeholder="apa yang harus dikerjakan?"
            />
            <button class="btn btn--primary" type="submit">Tambah</button>
          </form>
          ${() => form.errors.text && html`<p class="err">${() => form.errors.text}</p>`}

          <ul class="todo-list">
            ${Transition(
              "fade",
              () => html`${For(
                () => todos(),
                (todo) => html`
                  <li class="todo">
                    <span>${() => todo().text}</span>
                    <button
                      class="btn btn--ghost"
                      @click=${() => removeTodo(todo().id)}
                    >
                      ×
                    </button>
                  </li>
                `,
                { key: (t) => t.id },
              )}`,
              { duration: 200 },
            )}
          </ul>
        </section>

        <hr class="divider" />

        <section class="stack">
          <h2 class="section">Mutation (mock async)</h2>
          <div class="cluster">
            <button
              class="btn btn--primary"
              disabled=${() => save.loading()}
              @click=${() => save.mutate().catch(() => undefined)}
            >
              ${() => (save.loading() ? "Saving…" : "Save")}
            </button>
            ${() => save.data() && html`<span class="muted">${() => save.data()}</span>`}
            ${() => save.error() && html`<span class="err">${() => (save.error() as Error).message}</span>`}
          </div>
        </section>
      </div>
    </div>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
