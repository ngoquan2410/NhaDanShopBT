import { useMemo, useState, useEffect } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string = string> {
  key: K | null;
  dir: SortDir;
}

export interface UseTableControlsOptions<T, K extends string> {
  data: T[];
  pageSize?: number;
  initialSort?: SortState<K>;
  /** Map of sort key -> value extractor */
  sortAccessors?: Record<K, (row: T) => string | number | Date>;
  /** Reset to page 1 when this token changes (search/filter changes) */
  resetToken?: unknown;
}

export interface UseTableControlsResult<T, K extends string> {
  pageRows: T[];
  sortedRows: T[];
  total: number;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  totalPages: number;
  sort: SortState<K>;
  toggleSort: (key: K) => void;
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Generic client-side table controller: sorting + pagination.
 * Keeps page in range when underlying data shrinks.
 */
export function useTableControls<T, K extends string = string>({
  data,
  pageSize: initialPageSize = 20,
  initialSort,
  sortAccessors,
  resetToken,
}: UseTableControlsOptions<T, K>): UseTableControlsResult<T, K> {
  const [sort, setSort] = useState<SortState<K>>(initialSort ?? { key: null, dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => { setPage(1); }, [resetToken, pageSize]);

  const sortedRows = useMemo(() => {
    if (!sort.key || !sortAccessors || !sortAccessors[sort.key]) return data;
    const acc = sortAccessors[sort.key];
    const sorted = [...data].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), "vi", { numeric: true, sensitivity: "base" });
    });
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [data, sort, sortAccessors]);

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  if (safePage !== page) {
    // schedule correction
    queueMicrotask(() => setPage(safePage));
  }
  const startIdx = (safePage - 1) * pageSize;
  const pageRows = sortedRows.slice(startIdx, startIdx + pageSize);
  const rangeStart = total === 0 ? 0 : startIdx + 1;
  const rangeEnd = Math.min(total, startIdx + pageSize);

  const toggleSort = (key: K) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };

  return {
    pageRows,
    sortedRows,
    total,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    sort,
    toggleSort,
    rangeStart,
    rangeEnd,
  };
}
