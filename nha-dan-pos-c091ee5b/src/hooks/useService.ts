// Standard async hook used by service-layer consumers.
// Provides loading / error / empty / data in one consistent shape so screens
// can render uniformly while the backend is still local. Backend-ready: when
// adapters become remote, no consumer needs to change.
//
// Scope (P1, FE skeleton):
//  - no caching, no retries, no dedup — keep dependency-free
//  - reload() forces a refetch; refresh token also invalidates
//  - isEmpty is a hint only; consumers decide how "empty" looks
//
// Usage:
//   const { data, loading, error, isEmpty, reload } = useService(
//     () => products.list({ page: 1, pageSize: 20 }),
//     [page, pageSize],
//   );

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseServiceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** True only when the loaded value is an empty array / paged result with 0 items. */
  isEmpty: boolean;
  /** Force re-run of the fetcher. */
  reload: () => void;
}

function deriveEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const v = value as { items?: unknown; total?: number };
    if (Array.isArray(v.items)) return v.items.length === 0;
    if (typeof v.total === "number") return v.total === 0;
  }
  return false;
}

export function useService<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): UseServiceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const cancelledRef = useRef(false);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        if (cancelledRef.current) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoading(false);
      });
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return {
    data,
    loading,
    error,
    isEmpty: !loading && !error && deriveEmpty(data),
    reload,
  };
}
