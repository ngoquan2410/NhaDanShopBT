import { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

interface Props {
  actions: RowAction[];
  align?: "end" | "start";
}

/**
 * Consistent row-level action menu using Radix DropdownMenu (portaled,
 * never clipped by table overflow). Use across all admin list tables.
 */
export function RowActions({ actions, align = "end" }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Thao tác"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44 z-[60]">
        {actions.map((a, i) => (
          <div key={i}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                if (a.disabled) return;
                a.onClick();
              }}
              disabled={a.disabled}
              title={a.disabled ? a.disabledReason : undefined}
              className={cn(
                "gap-2 text-xs",
                a.danger && "text-danger focus:text-danger focus:bg-danger-soft",
              )}
            >
              {a.icon}
              <span className="flex-1">{a.label}</span>
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
