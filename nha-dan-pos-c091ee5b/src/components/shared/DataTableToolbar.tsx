import { Search, SlidersHorizontal, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function DataTableToolbar({ search, onSearchChange, searchPlaceholder = "Tìm kiếm...", filters, actions, className }: DataTableToolbarProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row gap-2", className)}>
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-8 pl-9 pr-3 text-sm bg-card rounded-md border focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {filters && <div className="flex gap-2 overflow-x-auto">{filters}</div>}
      {actions && <div className="flex gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}

export function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "shrink-0 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
      active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
    )}>
      {label}
    </button>
  );
}
