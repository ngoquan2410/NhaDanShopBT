import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PeriodPreset = "all" | "today" | "week" | "month" | "custom";

export interface PeriodValue {
  preset: PeriodPreset;
  /** ISO yyyy-mm-dd inclusive */
  from?: string;
  /** ISO yyyy-mm-dd inclusive */
  to?: string;
}

interface Props {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  className?: string;
}

function todayISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function startOfWeekISO(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Returns true if `dateStr` (ISO date or datetime) falls within the given period.
 * Comparison is done on the date portion only (yyyy-mm-dd).
 */
export function matchesPeriod(dateStr: string, period: PeriodValue): boolean {
  if (period.preset === "all") return true;
  const d = dateStr.slice(0, 10);
  let from: string | undefined;
  let to: string | undefined;
  if (period.preset === "today") { from = todayISO(); to = todayISO(); }
  else if (period.preset === "week") { from = startOfWeekISO(); to = todayISO(); }
  else if (period.preset === "month") { from = startOfMonthISO(); to = todayISO(); }
  else { from = period.from; to = period.to; }
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "today", label: "Hôm nay" },
  { key: "week", label: "Tuần này" },
  { key: "month", label: "Tháng này" },
];

export function PeriodFilter({ value, onChange, className }: Props) {
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => { setCustomOpen(false); onChange({ preset: p.key }); }}
          className={cn(
            "shrink-0 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
            value.preset === p.key ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => {
          const next = !customOpen;
          setCustomOpen(next);
          if (next) onChange({ preset: "custom", from: value.from ?? todayISO(), to: value.to ?? todayISO() });
        }}
        className={cn(
          "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
          value.preset === "custom" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
        )}
      >
        <CalendarIcon className="h-3 w-3" /> Tùy chọn
      </button>
      {customOpen && value.preset === "custom" && (
        <div className="flex items-center gap-1 text-xs">
          <input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })}
            className="h-7 px-2 border rounded-md bg-background"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })}
            className="h-7 px-2 border rounded-md bg-background"
          />
        </div>
      )}
    </div>
  );
}
