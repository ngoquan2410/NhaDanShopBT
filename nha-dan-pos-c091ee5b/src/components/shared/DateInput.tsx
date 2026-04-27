import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  /** Allow future dates (only for HSD / expiry fields). */
  allowFuture?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  /** ISO datetime input instead of date. */
  withTime?: boolean;
}

/**
 * Global date/datetime picker for the admin area.
 * - Disallows future dates by default (Vietnamese retail business rule).
 * - Pass `allowFuture` for HSD / expiry date fields.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ allowFuture = false, withTime = false, value, onChange, className, ...rest }, ref) => {
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);
    const nowISO = now.toISOString().slice(0, 16);
    const max = allowFuture ? undefined : withTime ? nowISO : todayISO;

    return (
      <input
        ref={ref}
        type={withTime ? "datetime-local" : "date"}
        value={value ?? ""}
        max={max}
        onChange={(e) => {
          const v = e.target.value;
          if (!allowFuture && v && v > (max ?? "")) {
            toast.error("Không được chọn ngày trong tương lai");
            return;
          }
          onChange?.(v);
        }}
        className={cn(
          "h-8 px-2 text-xs border rounded-md bg-card focus:outline-none focus:ring-1 focus:ring-ring",
          className
        )}
        {...rest}
      />
    );
  }
);
DateInput.displayName = "DateInput";
