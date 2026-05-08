import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  hint?: string;
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  allowClear?: boolean;
  /** Minimum menu width (px). Default 320. */
  menuMinWidth?: number;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "-- Chọn --",
  emptyText = "Không có kết quả",
  disabled,
  className,
  size = "md",
  allowClear,
  menuMinWidth = 320,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = (o.searchText ?? `${o.label} ${o.hint ?? ""}`).toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  const computePosition = React.useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const desiredWidth = Math.min(Math.max(menuMinWidth, r.width), vw - margin * 2);
    let left = r.left;
    if (left + desiredWidth > vw - margin) left = Math.max(margin, vw - margin - desiredWidth);
    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;
    const estMenuH = 360;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const top = openUp ? Math.max(margin, r.top - Math.min(estMenuH, spaceAbove - margin) - 4) : r.bottom + 4;
    setMenuPos({ top, left, width: desiredWidth });
  }, [menuMinWidth]);

  React.useEffect(() => {
    if (!open) return;
    computePosition();
    const onScroll = () => computePosition();
    const onResize = () => computePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, computePosition]);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  React.useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered, activeIdx]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[activeIdx];
      if (o) commit(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const heightCls = size === "sm" ? "h-8 text-sm" : "h-9 text-sm";

  const menu = open && menuPos && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width, zIndex: 1000 }}
          className="overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-2">
            <Search className="h-4 w-4 opacity-60" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Tìm kiếm..."
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} className="max-h-[360px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((o, i) => {
                const isActive = i === activeIdx;
                const isSelected = o.value === value;
                return (
                  <div
                    key={o.value}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commit(o.value);
                    }}
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-sm",
                      isActive && "bg-accent text-accent-foreground",
                      isSelected && "font-medium",
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words line-clamp-2">{o.label}</span>
                    {o.hint && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground text-right max-w-[45%] line-clamp-2">
                        {o.hint}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-left ring-offset-background transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          heightCls,
        )}
      >
        <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint && <span className="ml-1 text-muted-foreground">— {selected.hint}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
        {allowClear && selected && !disabled ? (
          <X
            className="h-4 w-4 shrink-0 opacity-60 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        )}
      </button>
      {menu}
    </div>
  );
}

export default SearchableSelect;
