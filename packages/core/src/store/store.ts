// store.ts — persisted() signal dengan cross-tab sync

import { signal, effect, type Getter, type Setter } from "../reactivity/signal.ts";

export interface PersistOptions<T> {
  storage?: Storage;
  serialize?: (v: T) => string;
  deserialize?: (s: string) => T;
  debounce?: number;
  sync?: boolean;
}

export function persisted<T>(
  key: string,
  initial: T,
  opts: PersistOptions<T> = {},
): [Getter<T>, Setter<T>] {
  const storage = opts.storage ?? localStorage;
  const serialize = opts.serialize ?? JSON.stringify;
  const deserialize = opts.deserialize ?? (JSON.parse as (s: string) => T);
  const debounce = opts.debounce ?? 0;
  const sync = opts.sync ?? false;

  let start = initial;
  const raw = storage.getItem(key);
  if (raw !== null) {
    try {
      start = deserialize(raw);
    } catch {
      /* nilai rusak: pakai initial */
    }
  }

  const [value, setValue] = signal<T>(start);

  let writing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  effect(() => {
    const v = value();
    const write = () => {
      writing = true;
      try {
        storage.setItem(key, serialize(v));
      } finally {
        writing = false;
      }
    };
    if (debounce > 0) {
      clearTimeout(timer);
      timer = setTimeout(write, debounce);
    } else {
      write();
    }
  });

  if (sync && typeof window !== "undefined") {
    window.addEventListener("storage", (e: StorageEvent) => {
      if (e.key !== key || e.storageArea !== storage) return;
      if (writing) return;
      if (e.newValue === null) {
        setValue(() => initial);
        return;
      }
      try {
        setValue(() => deserialize(e.newValue!));
      } catch {
        /* abaikan nilai rusak dari tab lain */
      }
    });
  }

  return [value, setValue];
}
