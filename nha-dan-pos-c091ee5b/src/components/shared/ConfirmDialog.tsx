import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', variant = 'default' }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Solid dim only — no backdrop-blur to avoid stacking over an open drawer
          (drawer's blur + this blur would smear text across them, see issue #7). */}
      <div className="fixed inset-0 bg-foreground/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg border shadow-2xl w-full max-w-md animate-scale-in">
        <div className="p-5">
          <div className="flex items-start gap-3">
            {variant !== 'default' && (
              <div className={cn("rounded-full p-2 shrink-0", variant === 'danger' ? 'bg-danger-soft' : 'bg-warning-soft')}>
                <AlertTriangle className={cn("h-5 w-5", variant === 'danger' ? 'text-danger' : 'text-warning')} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-muted/30 rounded-b-lg">
          <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium border rounded-md hover:bg-muted transition-colors">{cancelLabel}</button>
          <button onClick={() => { onConfirm(); onClose(); }} className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            variant === 'danger' ? "bg-danger text-danger-foreground hover:bg-danger/90" :
            variant === 'warning' ? "bg-warning text-warning-foreground hover:bg-warning/90" :
            "bg-primary text-primary-foreground hover:bg-primary-hover"
          )}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
