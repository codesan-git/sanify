// components/x-table.ts — tabel data dengan sorting kolom
//
// Usage:
//   const [rows, setRows] = signal([...]);
//   const cols = [
//     { key: "name", label: "Nama", sortable: true },
//     { key: "age",  label: "Usia", sortable: true },
//   ];
//
//   return () => html`
//     <x-table .columns=${cols} .rows=${rows}>
//       <!-- ❗ optional: custom cell render -->
//       <template data-col="age">
//         ${(row) => html`<strong>${row.age}</strong>`}
//       </template>
//     </x-table>
//   `;
//
//   // Table otomatis sort saat header diklik.

import { component, html, signal } from "@sanify/core";

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

component<{ columns: TableColumn[]; rows: Record<string, unknown>[] }>(
  "x-table",
  ({ props, el }) => {
    const [sortKey, setSortKey] = signal<string | null>(null);
    const [sortDir, setSortDir] = signal<"asc" | "desc">("asc");

    const toggleSort = (key: string) => {
      if (sortKey() === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    };

    const sortedRows = () => {
      const key = sortKey();
      if (!key) return props.rows();
      const dir = sortDir();
      return [...props.rows()].sort((a, b) => {
        const va = a[key] ?? "";
        const vb = b[key] ?? "";
        if (typeof va === "number" && typeof vb === "number") {
          return dir === "asc" ? va - vb : vb - va;
        }
        const cmp = String(va).localeCompare(String(vb));
        return dir === "asc" ? cmp : -cmp;
      });
    };

    const getTemplate = (colKey: string) => {
      return el.querySelector<HTMLTemplateElement>(
        `template[data-col="${colKey}"]`,
      );
    };

    return () => html`
      <div class="x-table">
        <table>
          <thead>
            <tr>
              ${props.columns().map((col) => html`
                <th
                  class=${col.sortable ? "x-table__th--sortable" : ""}
                  aria-sort=${sortKey() === col.key ? (sortDir() === "asc" ? "ascending" : "descending") : "none"}
                  @click=${col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span>${col.label}</span>
                  ${col.sortable ? html`
                    <span class="x-table__sort-icon" aria-hidden="true">
                      ${() => sortKey() === col.key
                        ? (sortDir() === "asc" ? " ▲" : " ▼")
                        : ""}
                    </span>
                  ` : null}
                </th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${() => sortedRows().map((row) => html`
              <tr>
                ${props.columns().map((col) => {
                  const tpl = getTemplate(col.key);
                  return html`<td>${tpl ? tpl.innerHTML : String(row[col.key] ?? "")}</td>`;
                })}
              </tr>
            `)}
            ${() => sortedRows().length === 0 ? html`
              <tr>
                <td colspan=${props.columns().length} class="x-table__empty muted">
                  Tidak ada data
                </td>
              </tr>
            ` : null}
          </tbody>
        </table>
      </div>
    `;
  },
  { props: ["columns", "rows"] },
);

if (import.meta.hot) import.meta.hot.accept();
