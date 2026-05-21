import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { localToday, toLocalDateString } from "@/lib/localDate";

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
  /**
   * Opt-in: when true, the custom from/to date inputs cannot accept a date
   * after today (Asia/Saigon local). Future values entered manually are
   * rejected with a toast and the previous valid value is kept.
   * Default: false (existing behavior unchanged for other pages).
   */
  disableFutureDates?: boolean;
}

function todayISO(): string {
  return localToday();
}

function startOfWeekISO(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return toLocalDateString(d);
}

function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return toLocalDateString(d);
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

export function PeriodFilter({ value, onChange, className, disableFutureDates }: Props) {
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");
  const maxDate = disableFutureDates ? todayISO() : undefined;

  const guardFuture = (next: string): string | null => {
    if (!disableFutureDates) return next;
    if (!next) return next;
    if (next > todayISO()) {
      toast.error("Không được chọn ngày trong tương lai");
      return null;
    }
    return next;
  };

  const handleFromChange = (raw: string) => {
    const v = guardFuture(raw);
    if (v === null) return;
    let nextTo = value.to;
    if (disableFutureDates && v && nextTo && v > nextTo) nextTo = v;
    onChange({ ...value, preset: "custom", from: v, to: nextTo });
  };

  const handleToChange = (raw: string) => {
    const v = guardFuture(raw);
    if (v === null) return;
    let nextFrom = value.from;
    if (disableFutureDates && v && nextFrom && v < nextFrom) nextFrom = v;
    onChange({ ...value, preset: "custom", from: nextFrom, to: v });
  };

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
            max={maxDate}
            onChange={(e) => handleFromChange(e.target.value)}
            className="h-7 px-2 border rounded-md bg-background"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={value.to ?? ""}
            max={maxDate}
            onChange={(e) => handleToChange(e.target.value)}
            className="h-7 px-2 border rounded-md bg-background"
          />
        </div>
      )}
    </div>
  );
}
