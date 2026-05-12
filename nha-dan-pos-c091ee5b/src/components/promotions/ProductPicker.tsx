import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { products as productService } from "@/services";

interface Props {
  value?: string;
  valueName?: string;
  onChange: (id: string, name: string) => void;
  error?: string;
  placeholder?: string;
}

export function ProductPicker({ value, valueName, onChange, error, placeholder = "Chọn sản phẩm..." }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [items, setItems] = useState<{ id: string; name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const queryArg = useMemo(() => {
    const t = debouncedSearch.trim();
    return t.length >= 2 ? t : undefined;
  }, [debouncedSearch]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const page = await productService.list({
          page: 1,
          pageSize: 20,
          query: queryArg,
          active: true,
        });
        if (!cancelled) {
          setItems(
            page.items.map((p) => ({ id: p.id, name: p.name, code: p.code })),
          );
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, queryArg]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-9 px-3 text-sm text-left border rounded-md bg-background flex items-center justify-between ${error ? "border-danger" : ""}`}
      >
        <span className={value ? "" : "text-muted-foreground"}>{valueName || placeholder}</span>
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="relative">
          <div className="absolute z-10 left-0 right-0 mt-1 border rounded-md bg-card shadow-lg p-2 space-y-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm sản phẩm..."
              className="w-full h-8 px-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="max-h-48 overflow-y-auto divide-y">
              {loading ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Đang tải…</p>
              ) : items.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Không có sản phẩm</p>
              ) : (
                items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id, p.name);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs"
                  >
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.code}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  );
}
