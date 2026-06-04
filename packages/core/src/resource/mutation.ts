// mutation.ts — write-side counterpart untuk resource(). Mengelola signal
// loading/error/data dan opsional cache invalidation setelah sukses.

import { signal, type Getter } from "../reactivity/signal.ts";
import { invalidate } from "./resource.ts";

export interface MutationOptions<TInput, TOutput> {
  // Key(s) cache yang di-invalidate setelah mutation sukses. Boleh:
  //   - string / array string  → invalidate exact
  //   - fungsi (data, input) => string | string[] | void  → dinamis (boleh
  //     return undefined untuk skip)
  invalidates?:
    | string
    | string[]
    | ((data: TOutput, input: TInput) => string | string[] | undefined);
  onSuccess?: (data: TOutput, input: TInput) => void | Promise<void>;
  onError?: (error: unknown, input: TInput) => void | Promise<void>;
}

export interface Mutation<TInput, TOutput> {
  // Trigger mutation. Promise resolve dengan hasil fetcher; throw kalau gagal.
  // Caller boleh await + try/catch; UI bisa observe via signal loading/error/data.
  mutate: (input: TInput) => Promise<TOutput>;
  loading: Getter<boolean>;
  error: Getter<unknown>;
  data: Getter<TOutput | undefined>;
  // Kembalikan state ke kondisi awal (data/error undefined, loading false).
  reset: () => void;
}

export function mutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  options: MutationOptions<TInput, TOutput> = {},
): Mutation<TInput, TOutput> {
  const [data, setData] = signal<TOutput | undefined>(undefined);
  const [loading, setLoading] = signal(false);
  const [error, setError] = signal<unknown>(undefined);

  // Race protection: panggilan kedua menyalip yang pertama. Signal hanya
  // di-update oleh panggilan terbaru; promise milik panggilan lama tetap
  // resolve normal untuk caller-nya.
  let runId = 0;

  const mutate = async (input: TInput): Promise<TOutput> => {
    const id = ++runId;
    setLoading(true);
    setError(() => undefined);
    try {
      const result = await fn(input);
      if (id === runId) {
        setData(() => result);
        setLoading(false);
        const inv = options.invalidates;
        if (inv !== undefined) {
          const keys = typeof inv === "function" ? inv(result, input) : inv;
          if (keys) {
            for (const k of Array.isArray(keys) ? keys : [keys]) invalidate(k);
          }
        }
        await options.onSuccess?.(result, input);
      }
      return result;
    } catch (err) {
      if (id === runId) {
        setError(() => err);
        setLoading(false);
        await options.onError?.(err, input);
      }
      throw err;
    }
  };

  const reset = (): void => {
    runId++;
    setData(() => undefined);
    setLoading(false);
    setError(() => undefined);
  };

  return { mutate, loading, error, data, reset };
}
