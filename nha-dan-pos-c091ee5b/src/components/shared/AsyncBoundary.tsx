// AsyncBoundary — render-prop helper that pairs with `useService` to render
// loading / error / empty / data states uniformly. Pure presentation; no data
// fetching of its own. Keeps screens free of repetitive boilerplate.
//
// Scope (P1):
//  - default skeleton/error/empty visuals can be overridden per call
//  - works with any value type (T or T[] or PagedResult<T>)

import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";

interface Props<T> {
  loading: boolean;
  error: Error | null;
  isEmpty: boolean;
  data: T | null;
  onRetry?: () => void;
  loadingFallback?: ReactNode;
  errorFallback?: (err: Error, retry?: () => void) => ReactNode;
  emptyFallback?: ReactNode;
  children: (data: T) => ReactNode;
}

export function AsyncBoundary<T>({
  loading,
  error,
  isEmpty,
  data,
  onRetry,
  loadingFallback,
  errorFallback,
  emptyFallback,
  children,
}: Props<T>) {
  if (loading) {
    return (
      <>
        {loadingFallback ?? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span>Đang tải…</span>
          </div>
        )}
      </>
    );
  }

  if (error) {
    if (errorFallback) return <>{errorFallback(error, onRetry)}</>;
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <p className="text-sm text-destructive">Không tải được dữ liệu</p>
        <p className="text-xs text-muted-foreground max-w-md">{error.message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </div>
    );
  }

  if (isEmpty || data == null) {
    return <>{emptyFallback ?? <EmptyState title="Không có dữ liệu" />}</>;
  }

  return <>{children(data)}</>;
}
