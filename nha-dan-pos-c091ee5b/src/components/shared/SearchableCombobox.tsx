import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboOption {
  id: string;
  label: string;
  sub?: string;
  /** Optional group heading. Options sharing the same group render under one heading. */
  group?: string;
  /** If true, option is shown but not selectable (e.g. ineligible promotion). */
  disabled?: boolean;
  /** Optional small status badge shown on the right of the option. */
  badge?: { label: string; tone?: "success" | "warning" | "danger" | "muted" };
}

interface Props {
  value: string; // selected id; "" means none
  onChange: (id: string) => void;
  options: ComboOption[];
  placeholder?: string;
  emptyOptionLabel?: string;     // e.g. "Khách lẻ" — when selected => value=""
  showEmptyOption?: boolean;
  onCreateNew?: (initialQuery: string) => void; // open inline create drawer
  createLabel?: string;          // e.g. "Tạo NCC mới"
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
}

export function SearchableCombobox({
  value, onChange, options, placeholder = "Tìm và chọn...",
  emptyOptionLabel, showEmptyOption,
  onCreateNew, createLabel = "Tạo mới",
  disabled, className, invalid,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options.slice(0, 50);
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || (o.sub ?? "").toLowerCase().includes(needle),
    ).slice(0, 50);
  }, [q, options]);

  const displayLabel = value === "" && showEmptyOption ? (emptyOptionLabel ?? "—") : (selected?.label ?? "");

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "w-full h-8 px-2 pr-7 text-sm border rounded-md bg-background text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60",
          invalid && "border-danger",
        )}
      >
        <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2" />
      </button>

      {open && !disabled && (
        <div className="absolute z-40 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-hidden flex flex-col animate-fade-in">
          <div className="p-1.5 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên, SĐT, mã..."
                className="w-full h-7 pl-7 pr-7 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 scrollbar-thin">
            {showEmptyOption && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setQ(""); }}
                className={cn("w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-muted/60", value === "" && "bg-muted")}
              >
                <span className="font-medium">{emptyOptionLabel}</span>
                {value === "" && <Check className="h-3 w-3 text-primary" />}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Không tìm thấy. {onCreateNew && "Bấm 'Tạo mới' bên dưới."}
              </div>
            ) : (
              groupOptions(filtered).map(([groupName, opts]) => (
                <div key={groupName || "_"}>
                  {groupName && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 sticky top-0">
                      {groupName}
                    </div>
                  )}
                  {opts.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={o.disabled}
                      onClick={() => { if (o.disabled) return; onChange(o.id); setOpen(false); setQ(""); }}
                      className={cn(
                        "w-full px-3 py-1.5 text-xs text-left flex items-center justify-between gap-2 hover:bg-muted/60 border-b last:border-0",
                        o.id === value && "bg-muted",
                        o.disabled && "opacity-70 cursor-not-allowed hover:bg-transparent",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{o.label}</div>
                        {o.sub && <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {o.badge && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap",
                            o.badge.tone === "success" && "bg-success-soft text-success",
                            o.badge.tone === "warning" && "bg-warning-soft text-warning",
                            o.badge.tone === "danger" && "bg-danger-soft text-danger",
                            (!o.badge.tone || o.badge.tone === "muted") && "bg-muted text-muted-foreground",
                          )}>{o.badge.label}</span>
                        )}
                        {o.id === value && <Check className="h-3 w-3 text-primary" />}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {onCreateNew && (
            <button
              type="button"
              onClick={() => { setOpen(false); onCreateNew(q); }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border-t hover:bg-muted/40"
            >
              <Plus className="h-3 w-3" /> {createLabel}{q ? ` "${q}"` : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Preserve insertion order of groups; "" group renders without heading.
function groupOptions(opts: ComboOption[]): [string, ComboOption[]][] {
  const map = new Map<string, ComboOption[]>();
  for (const o of opts) {
    const key = o.group ?? "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return Array.from(map.entries());
}
