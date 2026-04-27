import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "@/lib/store";

interface Props {
  value?: string;
  valueName?: string;
  onChange: (id: string, name: string) => void;
  error?: string;
  placeholder?: string;
}

export function ProductPicker({ value, valueName, onChange, error, placeholder = "Chọn sản phẩm..." }: Props) {
  const { products } = useStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)).slice(0, 50);
  }, [products, search]);

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
              {list.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Không có sản phẩm</p>
              ) : list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onChange(p.id, p.name); setOpen(false); setSearch(""); }}
                  className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs"
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.code}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  );
}
