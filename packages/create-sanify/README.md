# create-sanify

Scaffolder for [Sanify Frontend](https://www.npmjs.com/package/@sanify/core) projects.

## Usage

```bash
bun create sanify my-app
```

Without a name argument, the CLI prompts for one interactively. That's it — no flags, no questions, no configuration needed.

## Output

A ready-to-run app (signals, stores, keyed lists, nested routing, resource) with a Bun dev server and HMR:

```bash
cd my-app
bun install
bun dev        # http://localhost:54712
bun run build  # production bundle into dist/
```

Template uses semantic CSS (`.card`, `.btn`, `.stack`, etc.) defined in `src/style.css` and `src/theme.css`. Add any CSS framework later if needed.
