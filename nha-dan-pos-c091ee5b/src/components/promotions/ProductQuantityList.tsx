import { useMemo, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { useStore } from "@/lib/store";

interface Item {
  productId: string;
  productName: string;
  quantity: number;
}

interface Props {
  label: string;
  items: Item[];
  onChange: (items: Item[]) => void;
  error?: string;
  excludeProductIds?: string[];
}

export function ProductQuantityList({ label, items, onChange, error, excludeProductIds = [] }: Props) {
  const { products } = useStore();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const usedIds = new Set(items.map((i) => i.productId));
  const excluded = new Set(excludeProductIds);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !usedIds.has(p.id) && !excluded.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, search, usedIds, excluded]);

  const add = (id: string, name: string) => {
    onChange([...items, { productId: id, productName: name, quantity: 1 }]);
    setSearch("");
    setOpen(false);
  };
  const updateQty = (id: string, qty: number) =>
    onChange(items.map((i) => (i.productId === id ? { ...i, quantity: Math.max(0, qty) } : i)));
  const remove = (id: string) => onChange(items.filter((i) => i.productId !== id));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-[11px] text-muted-foreground">{items.length} sản phẩm</span>
      </div>

      {items.length > 0 && (
        <div className="border rounded-md divide-y mb-2 bg-card">
          {items.map((i) => (
            <div key={i.productId} className="flex items-center gap-2 p-2">
              <span className="flex-1 text-xs truncate">{i.productName}</span>
              <input
                type="number"
                min={1}
                value={i.quantity}
                onChange={(e) => updateQty(i.productId, Number(e.target.value))}
                className="w-16 h-7 px-2 text-xs text-right border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[11px] text-muted-foreground">SL</span>
              <button type="button" onClick={() => remove(i.productId)} className="p-1 text-muted-foreground hover:text-danger rounded">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-1.5 h-8 text-xs font-medium border border-dashed rounded-md hover:bg-muted text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm sản phẩm
        </button>
        {open && (
          <div className="absolute z-10 left-0 right-0 mt-1 border rounded-md bg-card shadow-lg p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm sản phẩm..."
                className="w-full h-8 pl-7 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="max-h-48 overflow-y-auto divide-y">
              {candidates.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground text-center">Không có sản phẩm phù hợp</p>
              ) : candidates.map((p) => (
                <button key={p.id} type="button" onClick={() => add(p.id, p.name)} className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.code}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
    </div>
  );
}
