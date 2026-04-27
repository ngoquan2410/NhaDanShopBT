import { X } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}

export function FormDrawer({ open, onClose, title, description, children, footer, width = "md" }: FormDrawerProps) {
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[width];
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative ml-auto h-full w-full bg-card border-l shadow-xl flex flex-col animate-slide-in-right", w)}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-base">{title}</h2>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">{children}</div>
        {footer && <div className="border-t bg-muted/30 px-5 py-3 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, required }: { label: string; children: ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-foreground">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
