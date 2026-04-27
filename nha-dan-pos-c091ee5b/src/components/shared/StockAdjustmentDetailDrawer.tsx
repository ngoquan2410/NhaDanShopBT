import { X, ClipboardCheck, Calendar, User, Lock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { StockAdjustment } from "@/lib/mock-data";
import { mockAdjustmentLines } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface Props {
  adjustment: StockAdjustment | null;
  onClose: () => void;
}

export function StockAdjustmentDetailDrawer({ adjustment, onClose }: Props) {
  if (!adjustment) return null;
  const lines = mockAdjustmentLines.slice(0, Math.max(1, Math.min(adjustment.itemCount, mockAdjustmentLines.length)));
  const totalPositive = lines.filter(l => l.difference > 0).reduce((s, l) => s + l.difference, 0);
  const totalNegative = lines.filter(l => l.difference < 0).reduce((s, l) => s + l.difference, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-l shadow-xl flex flex-col animate-slide-in-right">
        <div className="p-4 border-b flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm font-mono">{adjustment.code}</h2>
              {adjustment.status === 'confirmed' && <Lock className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="mt-1">
              <StatusBadge status={adjustment.status === 'draft' ? 'draft' : 'confirmed'} />
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Ngày tạo: {formatDate(adjustment.createdDate)}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><User className="h-3.5 w-3.5" /> Người tạo: {adjustment.createdBy ?? '—'}</div>
          </div>

          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Lý do: </span><span className="font-medium">{adjustment.reason}</span></div>
            {adjustment.note && <div className="text-xs text-muted-foreground italic">"{adjustment.note}"</div>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card border rounded-lg p-2 text-center">
              <p className="text-[11px] text-muted-foreground">Mặt hàng</p>
              <p className="text-base font-bold">{lines.length}</p>
            </div>
            <div className="bg-success-soft border border-success/20 rounded-lg p-2 text-center">
              <p className="text-[11px] text-success">Tăng</p>
              <p className="text-base font-bold text-success">+{totalPositive}</p>
            </div>
            <div className="bg-danger-soft border border-danger/20 rounded-lg p-2 text-center">
              <p className="text-[11px] text-danger">Giảm</p>
              <p className="text-base font-bold text-danger">{totalNegative}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chi tiết điều chỉnh</h3>
            <div className="border rounded-lg divide-y">
              {lines.map(l => (
                <div key={l.id} className={cn("p-3 text-sm", l.difference > 0 && "bg-success-soft/30", l.difference < 0 && "bg-danger-soft/30")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-xs truncate">{l.productName}</p>
                      <p className="text-[11px] text-muted-foreground">{l.variantName} · {l.variantCode}</p>
                    </div>
                    <span className={cn("font-bold text-sm shrink-0", l.difference > 0 ? "text-success" : l.difference < 0 ? "text-danger" : "text-muted-foreground")}>
                      {l.difference > 0 ? `+${l.difference}` : l.difference}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>HT: {l.systemQty}</span>
                    <span>Thực tế: {l.actualQty}</span>
                  </div>
                  {l.note && <p className="text-[11px] text-muted-foreground mt-1 italic">"{l.note}"</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t">
          <button onClick={onClose} className="w-full px-3 py-2 text-sm font-medium border rounded-md hover:bg-muted">Đóng</button>
        </div>
      </div>
    </div>
  );
}
