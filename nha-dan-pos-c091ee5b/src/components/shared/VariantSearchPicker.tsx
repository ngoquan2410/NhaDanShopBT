import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  searchVariantsForTransaction,
  type VariantSearchContext,
  type VariantTransactionSearchHit,
} from "@/services/catalog/variantTransactionSearch";

const DEBOUNCE_MS = 250;

export interface VariantSearchPickerProps {
  context: VariantSearchContext;
  onSelect: (hit: VariantTransactionSearchHit) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Shown in input when empty */
  inputTestId?: string;
  listTestId?: string;
  minChars?: number;
  pageSize?: number;
  activeOnly?: boolean;
  sellableOnly?: boolean;
}

export function VariantSearchPicker({
  context,
  onSelect,
  placeholder = "Tìm mã SP, tên SP, mã hoặc tên variant…",
  className,
  disabled,
  inputTestId,
  listTestId,
  minChars = 2,
  pageSize = 20,
  activeOnly,
  sellableOnly,
}: VariantSearchPickerProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hits, setHits] = useState<VariantTransactionSearchHit[]>([]);
  const debounceRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    const t = q.trim();
    window.clearTimeout(debounceRef.current);
    if (t.length < minChars) {
      abortRef.current?.abort();
      setHits([]);
      setLoading(false);
      setErr(null);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const seq = ++reqSeq.current;
      setLoading(true);
      setErr(null);
      void searchVariantsForTransaction({
        search: t,
        context,
        page: 0,
        size: pageSize,
        activeOnly,
        sellableOnly,
        signal: ac.signal,
      })
        .then((res) => {
          if (seq !== reqSeq.current) return;
          setHits(res.items);
        })
        .catch((e: unknown) => {
          if (e instanceof Error && e.name === "AbortError") return;
          if (seq !== reqSeq.current) return;
          setHits([]);
          setErr(e instanceof Error ? e.message : "Không tải được kết quả tìm kiếm");
        })
        .finally(() => {
          if (seq === reqSeq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [q, context, minChars, pageSize, activeOnly, sellableOnly]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          disabled={disabled}
          data-testid={inputTestId}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          autoComplete="off"
          placeholder={placeholder}
          className="h-8 w-full rounded-md border bg-card pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        {loading ? (
          <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {err ? <p className="mt-1 text-[10px] text-danger">{err}</p> : null}
      {open && q.trim().length >= minChars && (
        <ul
          data-testid={listTestId}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-xs shadow-md"
        >
          {!loading && hits.length === 0 && !err ? (
            <li className="px-3 py-2 text-muted-foreground">Không có biến thể phù hợp</li>
          ) : null}
          {hits.map((h) => (
            <li key={h.variantId}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-2.5 py-2 text-left hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(h);
                  setQ("");
                  setHits([]);
                  setOpen(false);
                }}
              >
                <span className="truncate font-medium">
                  {h.productName}{" "}
                  <span className="font-mono text-muted-foreground">· {h.variantName}</span>
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {h.productCode} · {h.variantCode}
                  {context === "pos" ? ` · Tồn: ${h.stockQty}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
