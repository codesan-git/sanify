// template.ts — html``, compile (cache), binding fine-grained

import {
  effect,
  signal,
  computed,
  onCleanup,
  createOwner,
  runWithOwner,
  getOwner,
  provideSuspense,
  type Owner,
  type Getter,
  type Setter,
  type Context,
} from "../reactivity/signal.ts";

const MARKER = "\uFEFFsanify";
// Diawali `data-` agar valid sebagai atribut HTML kustom dan tidak akan
// bentrok dengan atribut user (yang tidak akan menulis `data-sanify-attr-N`).
const ATTR_MARKER = "data-sanify-attr-";

export interface TemplateResult {
  strings: TemplateStringsArray;
  values: unknown[];
  __sanify: true;
}

export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): TemplateResult {
  return { strings, values, __sanify: true };
}

function isTemplateResult(v: unknown): v is TemplateResult {
  return typeof v === "object" && v !== null && (v as TemplateResult).__sanify === true;
}

function isReactive(v: unknown): v is () => unknown {
  return typeof v === "function";
}

// ── For: list keyed (rekonsiliasi lokal, bukan diffing global) ──
const FOR = Symbol("sanify.for");

export interface ForDirective<T> {
  [FOR]: true;
  each: () => readonly T[];
  render: (item: Getter<T>, index: Getter<number>) => unknown;
  key: (item: T, index: number) => unknown;
}

export function For<T>(
  each: () => readonly T[],
  render: (item: Getter<T>, index: Getter<number>) => unknown,
  options: { key?: (item: T, index: number) => unknown } = {},
): ForDirective<T> {
  return { [FOR]: true, each, render, key: options.key ?? ((item) => item) };
}

function isFor(v: unknown): v is ForDirective<unknown> {
  return typeof v === "object" && v !== null && (v as Record<symbol, unknown>)[FOR] === true;
}

function stringify(v: unknown): string {
  return v == null ? "" : String(v);
}

// ── Compile (sekali per-template, di-cache via WeakMap) ─────
type BindKind = "attr" | "event" | "prop" | "spread";

// Resep binding atribut: value = statics[0] + values[idx0] + statics[1] + ...
// Untuk event/prop selalu satu hole (statics diabaikan).
interface AttrBinding {
  kind: BindKind;
  name: string;
  statics: string[];
  valueIndices: number[];
}

interface Part {
  type: "text" | "attr";
  index: number;
  valueIndex?: number; // text
  recipeIndex?: number; // attr
}

interface CompiledTemplate {
  template: HTMLTemplateElement;
  parts: Part[];
  recipes: AttrBinding[];
}

const cache = new WeakMap<TemplateStringsArray, CompiledTemplate>();

const HOLE = "﻿"; // pembungkus token placeholder selama scanning

function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
}

// Scanner sadar-state: text / dalam-tag / dalam-kutip. Jauh lebih akurat dari
// heuristik lastIndexOf; mendukung atribut berkutip & multi-part.
function compile(strings: TemplateStringsArray): CompiledTemplate {
  let combined = strings[0] ?? "";
  for (let i = 1; i < strings.length; i++) {
    combined += `${HOLE}${i - 1}${HOLE}${strings[i] ?? ""}`;
  }

  const len = combined.length;
  const recipes: AttrBinding[] = [];
  let out = "";
  let pos = 0;
  let inTag = false;

  // Cocokkan token hole di posisi `at`; kembalikan indeks nilai + posisi akhir.
  function matchHole(at: number): { index: number; end: number } | null {
    if (combined[at] !== HOLE) return null;
    let j = at + 1;
    let num = "";
    while (j < len && combined[j] !== HOLE) num += combined[j++];
    if (j >= len) return null;
    return { index: Number(num), end: j + 1 };
  }

  while (pos < len) {
    const ch = combined[pos]!;

    if (!inTag) {
      if (combined.startsWith("<!--", pos)) {
        const close = combined.indexOf("-->", pos + 4);
        const end = close === -1 ? len : close + 3;
        out += combined.slice(pos, end);
        pos = end;
        continue;
      }
      if (ch === "<") {
        inTag = true;
        out += "<";
        pos++;
        continue;
      }
      const hole = matchHole(pos);
      if (hole) {
        out += `<!--${MARKER}${hole.index}-->`;
        pos = hole.end;
        continue;
      }
      out += ch;
      pos++;
      continue;
    }

    // dalam tag
    if (ch === ">") {
      inTag = false;
      out += ">";
      pos++;
      continue;
    }
    if (ch === "/" || isSpace(ch)) {
      out += ch;
      pos++;
      continue;
    }
    // hole di posisi nama atribut → spread: nilai (objek) di-iterate saat
    // render; tiap key diperlakukan persis seperti atribut template biasa
    // (@event / .prop / name=atribut). Nilai diperlakukan statis pada saat
    // mount — untuk reaktif per-key, bungkus nilainya jadi fungsi di objek.
    const spread = matchHole(pos);
    if (spread) {
      out += `${ATTR_MARKER}${recipes.length}=""`;
      recipes.push({
        kind: "spread",
        name: "",
        statics: [],
        valueIndices: [spread.index],
      });
      pos = spread.end;
      continue;
    }

    // baca nama atribut (case dipertahankan)
    let name = "";
    while (pos < len) {
      const c = combined[pos]!;
      if (c === "=" || c === ">" || c === "/" || isSpace(c) || c === HOLE) break;
      name += c;
      pos++;
    }
    if (combined[pos] !== "=") {
      out += name; // atribut boolean tanpa nilai
      continue;
    }
    pos++; // konsumsi '='

    // baca nilai → statics + valueIndices
    const statics: string[] = [];
    const valueIndices: number[] = [];
    let cur = "";
    const quote =
      combined[pos] === '"' || combined[pos] === "'" ? combined[pos] : null;
    if (quote) {
      pos++;
      while (pos < len && combined[pos] !== quote) {
        const hole = matchHole(pos);
        if (hole) {
          statics.push(cur);
          cur = "";
          valueIndices.push(hole.index);
          pos = hole.end;
        } else cur += combined[pos++];
      }
      pos++; // konsumsi kutip penutup
    } else {
      while (pos < len) {
        const c = combined[pos]!;
        if (isSpace(c) || c === ">" || c === "/") break;
        const hole = matchHole(pos);
        if (hole) {
          statics.push(cur);
          cur = "";
          valueIndices.push(hole.index);
          pos = hole.end;
        } else cur += c, pos++;
      }
    }
    statics.push(cur);

    if (valueIndices.length === 0) {
      out += `${name}="${statics[0]!.replace(/"/g, "&quot;")}"`; // atribut statis
      continue;
    }

    let kind: BindKind = "attr";
    let bindName = name;
    if (name[0] === "@") {
      kind = "event";
      bindName = name.slice(1);
    } else if (name[0] === ".") {
      kind = "prop";
      bindName = name.slice(1);
    }
    out += `${ATTR_MARKER}${recipes.length}=""`;
    recipes.push({ kind, name: bindName, statics, valueIndices });
  }

  const template = document.createElement("template");
  template.innerHTML = out;

  const parts: Part[] = [];
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );
  let nodeIndex = -1;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodeIndex++;

    if (node.nodeType === Node.COMMENT_NODE) {
      const data = (node as Comment).data;
      if (data.startsWith(MARKER)) {
        parts.push({
          type: "text",
          index: nodeIndex,
          valueIndex: Number(data.slice(MARKER.length)),
        });
      }
      continue;
    }

    const el = node as Element;
    for (const attr of [...el.attributes]) {
      if (!attr.name.startsWith(ATTR_MARKER)) continue;
      parts.push({
        type: "attr",
        index: nodeIndex,
        recipeIndex: Number(attr.name.slice(ATTR_MARKER.length)),
      });
      el.removeAttribute(attr.name);
    }
  }

	  const compiled: CompiledTemplate = { template, parts, recipes };

	  // Validasi: pastikan semua indeks referensi valid. Cegah cryptic error
	  // saat runtime (mis. recipeIndex out of bounds karena bug parser).
	  // Cek ini murah — cuma sekali per template literal (di-cache).
	  for (const p of parts) {
	    if (p.type === "attr" && p.recipeIndex !== undefined) {
	      if (p.recipeIndex < 0 || p.recipeIndex >= recipes.length) {
	        console.warn(
	          `sanify template: recipeIndex ${p.recipeIndex} out of bounds (recipes: ${recipes.length}). ` +
	          "Kemungkinan bug parser — periksa penulisan template literal.",
	        );
	      }
	    }
	  }
	  const holeCount = strings.length - 1;
	  if (parts.length !== holeCount) {
	    console.warn(
	      `sanify template: terdeteksi ${parts.length} binding dari ${holeCount} hole. ` +
	      "Mungkin ada hole di posisi yang tidak didukung (mis. nama tag, isi <style>/<script>).",
	    );
	  }

	  cache.set(strings, compiled);
	  return compiled;
}

function resolveNodes(root: DocumentFragment): Node[] {
  const nodes: Node[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

// ── Binding ─────────────────────────────────────────────────
function setAttr(el: Element, name: string, v: unknown): void {
  if (v == null || v === false) el.removeAttribute(name);
  else if (v === true) el.setAttribute(name, "");
  else el.setAttribute(name, String(v));
}

function bindAttr(el: Element, name: string, value: unknown): void {
  if (isReactive(value)) effect(() => setAttr(el, name, value()));
  else setAttr(el, name, value);
}

function bindProp(el: Element, name: string, value: unknown): void {
  const target = el as unknown as Record<string, unknown>;
  if (isReactive(value)) effect(() => void (target[name] = value()));
  else target[name] = value;
}

function bindAttribute(
  el: Element,
  recipe: AttrBinding,
  values: unknown[],
): void {
  const { kind, name, statics, valueIndices } = recipe;

  if (kind === "spread") {
    const value = values[valueIndices[0]!];
    if (value && typeof value === "object") {
      applyDynamicProps(el, value as Record<string, unknown>);
    }
    return;
  }
  if (kind === "event") {
    el.addEventListener(name, values[valueIndices[0]!] as EventListener);
    return;
  }
  if (kind === "prop") {
    bindProp(el, name, values[valueIndices[0]!]);
    return;
  }

  // atribut nilai-penuh (satu hole, tanpa statis) → pakai bindAttr (dukung
  // boolean true/false & null untuk add/remove atribut).
  if (valueIndices.length === 1 && statics[0] === "" && statics[1] === "") {
    bindAttr(el, name, values[valueIndices[0]!]);
    return;
  }

  // multi-part: rakit string dari potongan statis + nilai dinamis.
  const build = (): string => {
    let s = "";
    for (let k = 0; k < valueIndices.length; k++) {
      s += statics[k];
      const v = values[valueIndices[k]!];
      s += stringify(isReactive(v) ? v() : v);
    }
    return s + statics[statics.length - 1];
  };
  if (valueIndices.some((vi) => isReactive(values[vi]))) {
    effect(() => el.setAttribute(name, build()));
  } else {
    el.setAttribute(name, build());
  }
}

function clearRange(start: Comment, end: Comment): void {
  const parent = start.parentNode;
  if (!parent) return;
  let node = start.nextSibling;
  while (node && node !== end) {
    const next = node.nextSibling;
    parent.removeChild(node);
    node = next;
  }
}

// Kumpulkan node start..end (inklusif) menjadi array.
function collectRange(start: Comment, end: Comment): Node[] {
  const nodes: Node[] = [];
  let node: Node | null = start;
  while (node) {
    nodes.push(node);
    if (node === end) break;
    node = node.nextSibling;
  }
  return nodes;
}

function moveRange(start: Comment, end: Comment, anchor: Node): void {
  const parent = anchor.parentNode;
  if (!parent) return;
  for (const n of collectRange(start, end)) parent.insertBefore(n, anchor);
}

function removeRange(start: Comment, end: Comment): void {
  const parent = start.parentNode;
  if (!parent) return;
  for (const n of collectRange(start, end)) parent.removeChild(n);
}

function insertValue(value: unknown, end: Comment): void {
  const parent = end.parentNode;
  if (!parent) return;

  if (value == null || value === false || value === true) return;

  if (Array.isArray(value)) {
    for (const item of value) insertValue(item, end);
    return;
  }

  if (isTemplateResult(value)) {
    const frag = document.createDocumentFragment();
    renderInto(value, frag);
    parent.insertBefore(frag, end);
    return;
  }

  parent.insertBefore(document.createTextNode(stringify(value)), end);
}

// ── Scope directives: provide / Portal / ErrorBoundary / Suspense ──
const PROVIDE = Symbol("sanify.provide");
const PORTAL = Symbol("sanify.portal");
const ERROR_BOUNDARY = Symbol("sanify.errorBoundary");
const SUSPENSE = Symbol("sanify.suspenseDir");
const DYNAMIC = Symbol("sanify.dynamic");
const TRANSITION = Symbol("sanify.transition");
const TRANSITION_GROUP = Symbol("sanify.transitionGroup");

interface ProvideDirective {
  [PROVIDE]: true;
  id: symbol;
  value: unknown;
  children: () => unknown;
}
interface PortalDirective {
  [PORTAL]: true;
  target: Node;
  children: () => unknown;
}
interface ErrorBoundaryDirective {
  [ERROR_BOUNDARY]: true;
  fallback: (err: unknown, reset: () => void) => unknown;
  children: () => unknown;
}

// Tangkap error saat render/effect di subtree; tampilkan `fallback`.
export function ErrorBoundary(
  fallback: (err: unknown, reset: () => void) => unknown,
  children: () => unknown,
): ErrorBoundaryDirective {
  return { [ERROR_BOUNDARY]: true, fallback, children };
}

interface SuspenseDirective {
  [SUSPENSE]: true;
  fallback: () => unknown;
  children: () => unknown;
}

// Tampilkan `fallback` selama ada resource() di subtree yang masih loading;
// `children` tetap ter-mount (disembunyikan) supaya fetch-nya jalan.
export function Suspense(
  fallback: () => unknown,
  children: () => unknown,
): SuspenseDirective {
  return { [SUSPENSE]: true, fallback, children };
}

interface DynamicDirective {
  [DYNAMIC]: true;
  tag: () => string;
  props: Record<string, unknown> | undefined;
}

// Render elemen yang tag-nya ditentukan saat runtime. Elemen dibuat ulang saat
// tag berubah; key props mengikuti konvensi template: `@event`, `.prop`, atau
// nama atribut biasa. Nilai berupa fungsi diperlakukan reaktif.
export function Dynamic(
  tag: () => string,
  props?: Record<string, unknown>,
): DynamicDirective {
  return { [DYNAMIC]: true, tag, props };
}

function applyDynamicProps(el: Element, props: Record<string, unknown>): void {
  for (const key of Object.keys(props)) {
    const v = props[key];
    if (key[0] === "@") el.addEventListener(key.slice(1), v as EventListener);
    else if (key[0] === ".") bindProp(el, key.slice(1), v);
    else bindAttr(el, key, v);
  }
}

// Sediakan nilai context untuk subtree `children`.
export function provide<T>(
  ctx: Context<T>,
  value: T,
  children: () => unknown,
): ProvideDirective {
  return { [PROVIDE]: true, id: ctx.id, value, children };
}

// Render `children` ke `target` (mis. document.body), bukan di tempat asal.
export function Portal(target: Node, children: () => unknown): PortalDirective {
  return { [PORTAL]: true, target, children };
}

export interface TransitionOptions {
  // Fallback timeout (ms) bila animationend/transitionend tidak pernah fire.
  // Default 500.
  duration?: number;
  // Jalankan enter animation juga saat mount pertama. Default false.
  appear?: boolean;
}

interface TransitionDirective {
  [TRANSITION]: true;
  name: string;
  children: () => unknown;
  options: TransitionOptions;
}

// Bungkus konten reaktif dengan animasi CSS enter/leave. Saat children()
// mengembalikan nilai baru, konten lama mendapat class `${name}-leave`
// lalu di-remove setelah animationend/transitionend (atau setelah `duration`
// ms bila tidak ada animasi). Konten baru di-insert dengan class `${name}-enter`
// yang dilepas pula setelah animasi selesai.
// Default tidak animasi pada mount pertama; set `appear: true` untuk override.
// Respect `prefers-reduced-motion: reduce` → animasi dilewati.
export function Transition(
  name: string,
  children: () => unknown,
  options: TransitionOptions = {},
): TransitionDirective {
  return { [TRANSITION]: true, name, children, options };
}

// ── TransitionGroup: animasi enter/leave untuk list ──────────

interface TransitionGroupDirective<T> {
  [TRANSITION_GROUP]: true;
  name: string;
  each: () => readonly T[];
  render: (item: Getter<T>, index: Getter<number>) => unknown;
  key: (item: T, index: number) => unknown;
  options: TransitionOptions;
}

// Bungkus list dengan animasi CSS enter/leave per-item. Menggantikan For
// saat butuh transisi item masuk/keluar. Item baru dapat class
// `${name}-enter`; item hilang dapat `${name}-leave` lalu di-remove
// setelah animasi selesai (atau fallback timer).
export function TransitionGroup<T>(
  name: string,
  each: () => readonly T[],
  render: (item: Getter<T>, index: Getter<number>) => unknown,
  options: { key?: (item: T, index: number) => unknown } & TransitionOptions = {},
): TransitionGroupDirective<T> {
  return {
    [TRANSITION_GROUP]: true,
    name,
    each,
    render,
    key: options.key ?? ((item) => item),
    options,
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Tambah `className` ke tiap elemen, tunggu animationend/transitionend (atau
// fallback timer), lalu lepas class. Memanggil onComplete pada akhir.
function animateClass(
  els: Element[],
  className: string,
  duration: number,
  onComplete: () => void,
): void {
  if (prefersReducedMotion() || els.length === 0) {
    onComplete();
    return;
  }
  let remaining = els.length;
  let done = false;

  const finish = (): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    for (const el of els) {
      el.classList.remove(className);
      el.removeEventListener("animationend", handler);
      el.removeEventListener("transitionend", handler);
    }
    onComplete();
  };

  const handler = (e: Event): void => {
    // Hanya hitung event yang target-nya elemen di set ini (animationend
    // bubble dari descendant pun bisa fire — kita tidak ingin double-count).
    if (!els.includes(e.target as Element)) return;
    remaining--;
    if (remaining <= 0) finish();
  };

  const timer = setTimeout(finish, duration);
  for (const el of els) {
    el.addEventListener("animationend", handler);
    el.addEventListener("transitionend", handler);
    el.classList.add(className);
  }
}

function collectElements(start: Comment, end: Comment): Element[] {
  const els: Element[] = [];
  let n: Node | null = start.nextSibling;
  while (n && n !== end) {
    if (n.nodeType === Node.ELEMENT_NODE) els.push(n as Element);
    n = n.nextSibling;
  }
  return els;
}

function bindTransition(
  start: Comment,
  end: Comment,
  dir: TransitionDirective,
): void {
  let owner: Owner | null = null;
  let firstRun = true;
  let animating = false;
  let pending: unknown;

  const duration = dir.options.duration ?? 500;

  // Pasang konten baru di antara start/end + enter animation (kecuali
  // first-run tanpa `appear`).
  const mount = (): void => {
    owner?.dispose();
    clearRange(start, end);
    owner = createOwner();
    runWithOwner(owner, () => insertValue(pending, end));
    const isFirst = firstRun;
    firstRun = false;
    if (isFirst && !dir.options.appear) return;
    const newEls = collectElements(start, end);
    if (newEls.length === 0) return;
    animateClass(newEls, `${dir.name}-enter`, duration, () => {});
  };

  // Effect tracks children(); kalau ada animasi yang sedang jalan, pending
  // tersimpan dan akan dipakai begitu animasi sekarang selesai.
  effect(() => {
    pending = dir.children();

    if (animating) return;
    if (firstRun) {
      mount();
      return;
    }

    const oldEls = collectElements(start, end);
    if (oldEls.length === 0) {
      mount();
      return;
    }

    animating = true;
    animateClass(oldEls, `${dir.name}-leave`, duration, () => {
      animating = false;
      mount();
    });
  });
}

// ── TransitionGroup handler ──────────────────────────────────

function bindTransitionGroup(
  _start: Comment,
  end: Comment,
  dir: TransitionGroupDirective<unknown>,
): void {
  let rows = new Map<unknown, Row>();
  let pendingRemove: { row: Row; timer: ReturnType<typeof setTimeout> }[] = [];

  onCleanup(() => {
    for (const row of rows.values()) row.owner.dispose();
    for (const pr of pendingRemove) {
      clearTimeout(pr.timer);
      pr.row.owner.dispose();
      removeRange(pr.row.start, pr.row.end);
    }
  });

  const duration = dir.options.duration ?? 500;
  const skipAnim = prefersReducedMotion();

  effect(() => {
    const items = dir.each();
    const keys = items.map((it: unknown, i: number) => dir.key(it, i));
    const next = new Map<unknown, Row>();

    for (let i = 0; i < items.length; i++) {
      const k = keys[i];
      let existing = rows.get(k);
      if (!existing) {
        const pi = pendingRemove.findIndex((pr) => {
          for (const [rk, rv] of rows) {
            if (rv === pr.row && rk === k) return true;
          }
          return false;
        });
        if (pi >= 0) {
          const pr = pendingRemove[pi]!;
          clearTimeout(pr.timer);
          pendingRemove.splice(pi, 1);
          existing = pr.row;
          const cls = collectElements(existing.start, existing.end);
          if (cls.length > 0) {
            animateClass(cls, dir.name + "-leave", 0, () => {});
          }
        }
      }
      if (existing) {
        rows.delete(k);
        existing.setItem(() => items[i]);
        existing.setIndex(() => i);
        next.set(k, existing);
      } else {
        const row = createRow(items[i] as unknown, i, dir as unknown as ForDirective<unknown>, end);
        next.set(k, row);
        if (!skipAnim) {
          const els = collectElements(row.start, row.end);
          if (els.length > 0) {
            animateClass(els, dir.name + "-enter", duration, () => {});
          }
        }
      }
    }

    for (const row of rows.values()) {
      if (skipAnim) {
        row.owner.dispose();
        removeRange(row.start, row.end);
        continue;
      }
      const els = collectElements(row.start, row.end);
      if (els.length > 0) {
        const timer = setTimeout(() => {
          row.owner.dispose();
          removeRange(row.start, row.end);
          pendingRemove = pendingRemove.filter((pr) => pr.row !== row);
        }, duration);
        pendingRemove.push({ row, timer });
        animateClass(els, dir.name + "-leave", duration, () => {});
      } else {
        row.owner.dispose();
        removeRange(row.start, row.end);
      }
    }

	    // ── Reorder dengan FLIP animation ──
	    // 1. Rekam posisi elemen yang akan dipindah (First).
	    const flips: { el: Element; prevLeft: number; prevTop: number }[] = [];
	    if (!skipAnim) {
	      let a: Node = end;
	      for (let i = keys.length - 1; i >= 0; i--) {
	        const row = next.get(keys[i]!);
	        if (row && row.end.nextSibling !== a) {
	          for (const el of collectElements(row.start, row.end)) {
	            const r = el.getBoundingClientRect();
	            flips.push({ el, prevLeft: r.left, prevTop: r.top });
	          }
	        }
	        if (row) a = row.start;
	      }
	    }

	    // 2. Pindahkan DOM ke posisi baru (Last).
	    let anchor: Node = end;
	    for (let i = keys.length - 1; i >= 0; i--) {
	      const row = next.get(keys[i]!);
	      if (row && row.end.nextSibling !== anchor) {
	        moveRange(row.start, row.end, anchor);
	      }
	      if (row) anchor = row.start;
	    }

	    // 3. FLIP: hitung delta, pasang inverse transform, animate ke identity (Invert + Play).
	    if (flips.length > 0) {
	      // Hitung delta posisi setelah DOM dipindah
	      const withDelta: { el: Element; dx: number; dy: number }[] = [];
	      for (const f of flips) {
	        const r = f.el.getBoundingClientRect();
	        const dx = f.prevLeft - r.left;
	        const dy = f.prevTop - r.top;
	        if (dx !== 0 || dy !== 0) withDelta.push({ el: f.el, dx, dy });
	      }
	      // Pasang inverse transform (no transition) — elemen tampak di posisi lama
	      for (const w of withDelta) {
	        const s = (w.el as HTMLElement).style;
	        s.transition = "none";
	        s.transform = `translate(${w.dx}px, ${w.dy}px)`;
	      }
	      // Force reflow agar browser apply transform sebelum animasi
	      if (withDelta.length) withDelta[0]!.el.getBoundingClientRect();
	      // Animasikan ke identity
	      for (const w of withDelta) {
	        const s = (w.el as HTMLElement).style;
	        s.transition = `transform ${duration}ms`;
	        s.transform = "";
	      }
	      // Bersihkan inline style setelah animasi selesai
	      if (withDelta.length) {
	        setTimeout(() => {
	          for (const w of withDelta) {
	            const s = (w.el as HTMLElement).style;
	            if (s.transition === `transform ${duration}ms`) s.transition = "";
	            if (s.transform === "") s.transform = ""; // no-op, jaga dari race condition
	            s.removeProperty("transition");
	            s.removeProperty("transform");
	          }
	        }, duration + 10);
	      }
	    }

	    rows = next;
  });
}

function isBranded(v: unknown, key: symbol): boolean {
  return typeof v === "object" && v !== null && (v as Record<symbol, unknown>)[key] === true;
}

function bindChild(start: Comment, end: Comment, value: unknown): void {
  if (isFor(value)) {
    reconcileList(end, value);
    return;
  }
  if (isBranded(value, PROVIDE)) {
    const dir = value as ProvideDirective;
    const parent = getOwner();
    const owner = createOwner(); // parent = currentOwner
    (owner.context ??= new Map()).set(dir.id, dir.value);
    parent?.add(() => owner.dispose());
    runWithOwner(owner, () => insertValue(dir.children(), end));
    return;
  }
  if (isBranded(value, PORTAL)) {
    const dir = value as PortalDirective;
    const parent = getOwner();
    const owner = createOwner();
    const pStart = document.createComment("");
    const pEnd = document.createComment("");
    dir.target.appendChild(pStart);
    dir.target.appendChild(pEnd);
    runWithOwner(owner, () => insertValue(dir.children(), pEnd));
    parent?.add(() => {
      owner.dispose();
      removeRange(pStart, pEnd);
    });
    return;
  }
  if (isBranded(value, ERROR_BOUNDARY)) {
    const dir = value as ErrorBoundaryDirective;
    const [errBox, setErrBox] = signal<{ err: unknown } | null>(null);
    const reset = () => setErrBox(null);
    let childOwner: Owner | null = null;
    effect(() => {
      childOwner?.dispose();
      clearRange(start, end);
      childOwner = createOwner();
      const box = errBox();
      if (box) {
        runWithOwner(childOwner, () => insertValue(dir.fallback(box.err, reset), end));
      } else {
        childOwner.errorHandler = (e) => setErrBox({ err: e });
        try {
          runWithOwner(childOwner, () => insertValue(dir.children(), end));
        } catch (e) {
          setErrBox({ err: e }); // error sinkron saat render
        }
      }
      return () => childOwner?.dispose();
    });
    return;
  }
  if (isBranded(value, SUSPENSE)) {
    const dir = value as SuspenseDirective;
    const parent = getOwner();
    const [pending, setPending] = signal(0);
    const owner = createOwner();
    provideSuspense(owner, {
      increment: () => setPending((n) => n + 1),
      decrement: () => setPending((n) => Math.max(0, n - 1)),
    });
    parent?.add(() => owner.dispose());

    // Dua kotak transparan layout (display:contents), di-toggle berdasar pending.
    const fallbackBox = document.createElement("div");
    const contentBox = document.createElement("div");
    const fbEnd = document.createComment("");
    const contentEnd = document.createComment("");
    fallbackBox.appendChild(fbEnd);
    contentBox.appendChild(contentEnd);
    end.parentNode!.insertBefore(fallbackBox, end);
    end.parentNode!.insertBefore(contentBox, end);

    insertValue(dir.fallback(), fbEnd);
    runWithOwner(owner, () => insertValue(dir.children(), contentEnd));

    effect(() => {
      const busy = pending() > 0;
      fallbackBox.style.display = busy ? "contents" : "none";
      contentBox.style.display = busy ? "none" : "contents";
    });
    return;
  }
  if (isBranded(value, TRANSITION)) {
    bindTransition(start, end, value as TransitionDirective);
    return;
  }
  if (isBranded(value, TRANSITION_GROUP)) {
    bindTransitionGroup(start, end, value as TransitionGroupDirective<unknown>);
    return;
  }
  if (isBranded(value, DYNAMIC)) {
    const dir = value as DynamicDirective;
    const tagMemo = computed(() => dir.tag()); // recreate hanya saat tag berubah
    let childOwner: Owner | null = null;
    effect(() => {
      childOwner?.dispose();
      clearRange(start, end);
      const tag = tagMemo();
      childOwner = createOwner();
      if (tag) {
        runWithOwner(childOwner, () => {
          const el = document.createElement(tag);
          if (dir.props) applyDynamicProps(el, dir.props);
          end.parentNode!.insertBefore(el, end);
        });
      }
      return () => childOwner?.dispose();
    });
    return;
  }
	  if (!isReactive(value)) {
	    insertValue(value, end);
	    return;
	  }
	  // Reaktivitas generik: getter yang mengembalikan TemplateResult atau nilai lain.
	  // Optimasi 1: bila getter mengembalikan TemplateResult dengan strings yang sama
	  // seperti render sebelumnya, binding fine-grained yang sudah terpasang akan
	  // meng-update sendiri — kita skip clearRange + render ulang.
	  // Optimasi 2: nilai primitif (string/number/boolean) di-update in-place
	  // pada TextNode yang sama — tanpa dispose owner & tanpa bongkar DOM.
	  // childOwner DIDISPOSE manual di awal tiap run (bukan via cleanup effect)
	  // supaya saat skip, childOwner tetap hidup dan inner effects tetap jalan.
	  let prevStrings: TemplateStringsArray | null = null;
	  let childOwner: Owner | null = null;
	  effect(() => {
	    const val = value();
	    if (isTemplateResult(val) && val.strings === prevStrings) {
	      return;
	    }
	    // Nilai primitif + TextNode sudah ada di posisi yang tepat → update in-place.
	    if (typeof val === "string" || typeof val === "number") {
	      const prev = end.previousSibling;
	      if (prev && prev.nodeType === Node.TEXT_NODE && prev !== start) {
	        prev.nodeValue = String(val);
	        prevStrings = null;
	        return;
	      }
	    }
	    prevStrings = isTemplateResult(val) ? val.strings : null;
	    childOwner?.dispose();
	    clearRange(start, end);
	    childOwner = createOwner();
	    runWithOwner(childOwner, () => insertValue(val, end));
	  });
	  onCleanup(() => childOwner?.dispose());
}

interface Row {
  start: Comment;
  end: Comment;
  owner: Owner;
  setItem: Setter<unknown>;
  setIndex: Setter<number>;
}

function createRow(
  item: unknown,
  index: number,
  dir: ForDirective<unknown>,
  holeEnd: Comment,
): Row {
  const start = document.createComment("");
  const end = document.createComment("");
  const owner = createOwner();
  const itemSig = signal<unknown>(item);
  const indexSig = signal<number>(index);

  const frag = document.createDocumentFragment();
  frag.appendChild(start);
  frag.appendChild(end);
  runWithOwner(owner, () => {
    insertValue(dir.render(itemSig[0], indexSig[0]), end);
  });
  holeEnd.parentNode?.insertBefore(frag, holeEnd);

  return { start, end, owner, setItem: itemSig[1], setIndex: indexSig[1] };
}

// Rekonsiliasi keyed pada satu binding list: reuse DOM untuk key yang sama,
// bikin baru untuk key baru, dispose yang hilang, lalu susun ulang urutannya.
function reconcileList(holeEnd: Comment, dir: ForDirective<unknown>): void {
  let rows = new Map<unknown, Row>();

  onCleanup(() => {
    for (const row of rows.values()) row.owner.dispose();
  });

  effect(() => {
    const items = dir.each();
    const keys = items.map((it, i) => dir.key(it, i));
    const next = new Map<unknown, Row>();

    for (let i = 0; i < items.length; i++) {
      const k = keys[i];
      const existing = rows.get(k);
      if (existing) {
        rows.delete(k);
        existing.setItem(() => items[i]);
        existing.setIndex(() => i);
        next.set(k, existing);
      } else {
        next.set(k, createRow(items[i], i, dir, holeEnd));
      }
    }

    // sisa rows lama → tidak terpakai → dispose & hapus dari DOM
    for (const row of rows.values()) {
      row.owner.dispose();
      removeRange(row.start, row.end);
    }

    // susun ulang DOM sesuai urutan keys (lewati yang sudah pas)
    let anchor: Node = holeEnd;
    for (let i = keys.length - 1; i >= 0; i--) {
      const row = next.get(keys[i])!;
      if (row.end.nextSibling !== anchor) moveRange(row.start, row.end, anchor);
      anchor = row.start;
    }

    rows = next;
  });
}

// ── Render ──────────────────────────────────────────────────
export function renderInto(result: TemplateResult, parent: Node): void {
  const { strings, values } = result;
  const compiled = cache.get(strings) ?? compile(strings);
  const clone = compiled.template.content.cloneNode(true) as DocumentFragment;
  const nodes = resolveNodes(clone);

  for (const part of compiled.parts) {
    const node = nodes[part.index];
    if (!node) continue;

    if (part.type === "text") {
      const start = document.createComment("");
      const end = document.createComment("");
      node.parentNode!.replaceChild(end, node);
      end.parentNode!.insertBefore(start, end);
      bindChild(start, end, values[part.valueIndex!]);
    } else {
      bindAttribute(node as Element, compiled.recipes[part.recipeIndex!]!, values);
    }
  }

  parent.appendChild(clone);
}

export function render(result: TemplateResult, container: Element): void {
  renderInto(result, container);
}
