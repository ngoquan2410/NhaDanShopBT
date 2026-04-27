import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

type Option = { id: string; label: string; sub?: string };

interface Props {
  options: Option[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear?: () => void;
  placeholder?: string;
  emptyText?: string;
  maxHeight?: string;
}

export function MultiPicker({ options, selectedIds, onToggle, onClear, placeholder = "Tìm kiếm...", emptyText = "Không có kết quả", maxHeight = "max-h-48" }: Props) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full h-8 pl-7 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <span className="text-[11px] text-muted-foreground shrink-0">{selectedIds.length} đã chọn</span>
        {selectedIds.length > 0 && onClear && (
          <button type="button" onClick={onClear} className="text-[11px] text-muted-foreground hover:text-foreground">Bỏ chọn</button>
        )}
      </div>
      <div className={`${maxHeight} overflow-y-auto border rounded-md bg-card divide-y`}>
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground text-center">{emptyText}</p>
        ) : filtered.map((opt) => {
          const checked = selectedIds.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted ${checked ? "bg-primary-soft" : ""}`}
            >
              <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary text-primary-foreground" : "bg-background"}`}>
                {checked && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-medium truncate block">{opt.label}</span>
                {opt.sub && <span className="text-[10px] text-muted-foreground">{opt.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
