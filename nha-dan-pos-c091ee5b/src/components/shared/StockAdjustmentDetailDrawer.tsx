import { useEffect, useState } from "react";
import { X, ClipboardCheck, Calendar, User, Lock, Undo2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { StockAdjustment, StockAdjustmentLine } from "@/lib/mock-data";
import { adminStockAdjustments } from "@/services";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  adjustment: StockAdjustment | null;
  onClose: () => void;
  /** Reload list/detail after reversing */
  onChanged?: () => void;
}

export function StockAdjustmentDetailDrawer({ adjustment, onClose, onChanged }: Props) {
  const [lines, setLines] = useState<StockAdjustmentLine[]>([]);
  const [meta, setMeta] = useState<StockAdjustment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    if (!adjustment) return;
    setError(null);
    setReverseReason("");
    setMeta(null);
    void Promise.all([
      adminStockAdjustments.getOne(adjustment.id),
      adminStockAdjustments.getLines(adjustment.id),
    ])
      .then(([m, ln]) => {
        setMeta(m);
        setLines(ln);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Không tải được phiếu điều chỉnh"));
  }, [adjustment]);

  if (!adjustment) return null;
  const hdr = meta ?? adjustment;
  const totalPositive = lines.filter((l) => l.difference > 0).reduce((s, l) => s + l.difference, 0);
  const totalNegative = lines.filter((l) => l.difference < 0).reduce((s, l) => s + l.difference, 0);

  const canReverse =
    hdr.status === "confirmed"
    && !hdr.reversedAt
    && !hdr.reversalAdjustmentId
    && !hdr.reversesAdjustmentId;

  const handleReverse = async () => {
    try {
      setReversing(true);
      await adminStockAdjustments.reverse(hdr.id, { reason: reverseReason });
      toast.success("Đã tạo phiếu đảo cho điều chỉnh đã xác nhận");
      onChanged?.();
      const [m, ln] = await Promise.all([
        adminStockAdjustments.getOne(hdr.id),
        adminStockAdjustments.getLines(hdr.id),
      ]);
      setMeta(m);
      setLines(ln);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đảo được phiếu");
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-l shadow-xl flex flex-col animate-slide-in-right">
        <div className="p-4 border-b flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm font-mono">{hdr.code}</h2>
              {hdr.status === "confirmed" && <Lock className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="mt-1">
              <StatusBadge status={hdr.status === "draft" ? "draft" : "confirmed"} />
              {hdr.reversedAt && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  Đã đảo
                  {hdr.reversalAdjustmentId ? ` · phiếu đảo #${hdr.reversalAdjustmentId}` : ""}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> Ngày tạo: {formatDate(hdr.createdDate)}</div>
            <div className="flex items-center gap-2 text-muted-foreground"><User className="h-3.5 w-3.5" /> Người tạo: {hdr.createdBy ?? "—"}</div>
          </div>

          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Lý do: </span><span className="font-medium">{hdr.reason}</span></div>
            {hdr.note && <div className="text-xs text-muted-foreground italic">"{hdr.note}"</div>}
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

          {canReverse && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Đảo phiếu (ghi nhận bút toán đối)</p>
              <p className="text-[11px] text-muted-foreground">
                Máy chủ tạo phiếu điều chỉnh đảo mới, khôi phục tồn theo dấu vết phân bổ lô; không chỉnh sửa trực tiếp phiếu gốc.
              </p>
              <textarea
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Lý do đảo (tùy chọn)"
                className="w-full min-h-[64px] text-xs rounded-md border bg-background px-2 py-1.5"
                maxLength={400}
              />
              <button
                type="button"
                disabled={reversing}
                data-testid="stock-adj-reverse-submit"
                onClick={handleReverse}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" /> {reversing ? "Đang xử lý…" : "Đảo phiếu đã xác nhận"}
              </button>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chi tiết điều chỉnh</h3>
            {error && <p className="text-xs text-danger mb-2">{error}</p>}
            <div className="border rounded-lg divide-y">
              {lines.map((l) => (
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
          <button type="button" onClick={onClose} className="w-full px-3 py-2 text-sm font-medium border rounded-md hover:bg-muted">Đóng</button>
        </div>
      </div>
    </div>
  );
}
