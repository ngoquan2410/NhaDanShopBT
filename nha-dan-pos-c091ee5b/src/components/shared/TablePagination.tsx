import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  rangeStart: number;
  rangeEnd: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function TablePagination({
                                  page, totalPages, total, rangeStart, rangeEnd, pageSize,
                                  onPageChange, onPageSizeChange,
                                  pageSizeOptions = [10, 20, 50, 100],
                                  className,
                                }: Props) {
  if (total === 0) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  // Two page-number sets: compact on mobile (current ±0), wider on sm+ (±1)
  const buildPages = (window: number): (number | "…")[] => {
    const out: (number | "…")[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= window) out.push(i);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  };
  const pagesMobile = buildPages(0);
  const pagesDesktop = buildPages(1);

  const renderPages = (list: (number | "…")[]) =>
      list.map((p, i) =>
          p === "…" ? (
              <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
              <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={cn(
                      "min-w-[26px] h-7 px-1.5 text-xs rounded-md border",
                      p === page ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-muted",
                  )}
              >
                {p}
              </button>
          ),
      );

  return (
      <div className={cn("flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground", className)}>
        <div className="flex items-center gap-2">
        <span>
          {rangeStart}-{rangeEnd} / <strong className="text-foreground">{total}</strong>
        </span>
          {onPageSizeChange && (
              <label className="flex items-center gap-1">
                <span className="hidden sm:inline">Hiển thị</span>
                <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="h-7 px-1.5 text-xs border rounded-md bg-background"
                >
                  {pageSizeOptions.map((n) => (
                      <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => onPageChange(1)} disabled={!canPrev} className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" title="Trang đầu">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onPageChange(page - 1)} disabled={!canPrev} className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" title="Trang trước">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="hidden sm:inline-flex items-center gap-0.5">{renderPages(pagesDesktop)}</span>
          <span className="inline-flex sm:hidden items-center gap-0.5">{renderPages(pagesMobile)}</span>
          <button onClick={() => onPageChange(page + 1)} disabled={!canNext} className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" title="Trang sau">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onPageChange(totalPages)} disabled={!canNext} className="p-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed" title="Trang cuối">
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
  );
}
