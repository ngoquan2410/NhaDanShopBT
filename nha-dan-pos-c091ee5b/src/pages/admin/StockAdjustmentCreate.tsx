import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { adminFetchJson } from "@/services/auth/adminApi";
import { inventory } from "@/services";
import type { InventoryProjection } from "@/services/types";
import {
  ArrowLeft, Save, Check, Trash2, Search, Plus, AlertTriangle, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AdminStockAdjustmentCreate() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'draft' | 'confirmed'>('draft');
  const [lines, setLines] = useState<Array<{
    id: string;
    variantId: string;
    variantCode: string;
    productName: string;
    variantName: string;
    systemQty: number;
    actualQty: number;
    difference: number;
    note: string;
  }>>([]);
  const [reason, setReason] = useState('Kiểm kho định kỳ');
  const [note, setNote] = useState('Kiểm kho tháng 4/2025');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<InventoryProjection[]>([]);
  const [lookup, setLookup] = useState<InventoryProjection[]>([]);
  const projectionsCacheRef = useRef<InventoryProjection[] | null>(null);
  const searchDebounceRef = useRef<number>(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const handleSaveDraft = () => {
    if (lines.length === 0) {
      toast.error("Chưa có mặt hàng nào để lưu nháp");
      return;
    }
    setSavedAt(new Date().toISOString());
    toast.success("Đã lưu nháp phiếu điều chỉnh");
  };

  const handleConfirm = async () => {
    if (hasDirectionViolation) {
      toast.error("Lý do Hàng hỏng chỉ được giảm tồn, không được tăng số lượng.");
      return;
    }
    try {
      const created = await adminFetchJson<{ id: number }>("/api/stock-adjustments", {
        method: "POST",
        body: JSON.stringify({
          reason: reason === "Kiểm kho định kỳ" ? "STOCKTAKE" : reason === "Hàng hỏng" ? "DAMAGED" : "OTHER",
          note,
          items: lines.map((line) => ({
            variantId: Number(line.variantId),
            actualQty: line.actualQty,
            note: line.note || null,
          })),
        }),
      });
      await adminFetchJson(`/api/stock-adjustments/${created.id}/confirm`, {
        method: "PUT",
      });
      setStatus('confirmed');
      toast.success("Đã xác nhận phiếu — tồn kho đã được cập nhật");
      navigate('/admin/stock-adjustments');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể tạo phiếu điều chỉnh");
      throw err;
    }
  };

  const handleDelete = () => {
    toast.success("Đã xóa phiếu nháp");
    navigate('/admin/stock-adjustments');
  };

  useEffect(() => {
    if (status !== "draft") return;
    const q = search.trim();
    window.clearTimeout(searchDebounceRef.current);
    if (!q) {
      setSuggestions([]);
      return;
    }
    searchDebounceRef.current = window.setTimeout(() => {
      void (async () => {
        let all = projectionsCacheRef.current;
        if (!all) {
          try {
            all = await inventory.listInventoryProjections();
            projectionsCacheRef.current = all;
            setLookup(all);
          } catch {
            setSuggestions([]);
            return;
          }
        }
        const ql = q.toLowerCase();
        const matches = all.filter(
          (p) =>
            String(p.variantCode ?? "").toLowerCase().includes(ql) ||
            String(p.productName ?? "").toLowerCase().includes(ql) ||
            String(p.variantName ?? "").toLowerCase().includes(ql) ||
            String(p.productCode ?? "").toLowerCase().includes(ql),
        ).slice(0, 12);
        setSuggestions(matches);
      })();
    }, 220);
    return () => window.clearTimeout(searchDebounceRef.current);
  }, [search, status]);

  const addProjectionLine = (projection: InventoryProjection) => {
    if (lines.some((l) => l.variantId === projection.variantId)) {
      toast.error("Phân loại đã có trong phiếu");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        id: `m-${projection.variantId}`,
        variantId: projection.variantId,
        variantCode: projection.variantCode ?? "-",
        productName: projection.productName ?? "",
        variantName: projection.variantName ?? "Mặc định",
        systemQty: projection.onHand,
        actualQty: projection.onHand,
        difference: 0,
        note: "",
      },
    ]);
    setSearch("");
    setSuggestions([]);
    toast.success(`Đã thêm "${projection.productName ?? projection.variantCode}" vào phiếu`);
  };

  const addLine = async () => {
    if (!search.trim()) return;
    if (suggestions.length > 0) {
      addProjectionLine(suggestions[0]);
      return;
    }
    let projections = lookup;
    if (projections.length === 0) {
      projections = await inventory.listInventoryProjections();
      setLookup(projections);
      projectionsCacheRef.current = projections;
    }
    const q = search.trim().toLowerCase();
    const projection = projections.find((p) =>
      String(p.variantCode ?? "").toLowerCase().includes(q) ||
      String(p.productName ?? "").toLowerCase().includes(q) ||
      String(p.variantName ?? "").toLowerCase().includes(q) ||
      String(p.productCode ?? "").toLowerCase().includes(q),
    );
    if (!projection) {
      toast.error("Không tìm thấy phân loại trong backend inventory");
      return;
    }
    addProjectionLine(projection);
  };

  const totalPositive = lines.filter(l => l.difference > 0).reduce((s, l) => s + l.difference, 0);
  const totalNegative = lines.filter(l => l.difference < 0).reduce((s, l) => s + l.difference, 0);
  const isDamageReason = reason === "Hàng hỏng";
  const hasDirectionViolation = isDamageReason && lines.some((l) => l.difference > 0);
  const updateLineActualQty = (lineId: string, rawValue: number) => {
    setLines((prev) => prev.map((line) => {
      if (line.id !== lineId) return line;
      const actualQty = isDamageReason ? Math.min(rawValue, line.systemQty) : rawValue;
      return { ...line, actualQty, difference: actualQty - line.systemQty };
    }));
  };

  return (
    <div className="admin-dense">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
        <Link to="/admin/stock-adjustments" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Kiểm kho</Link>
        <span>/</span><span className="text-foreground font-medium">{status === 'draft' ? 'Phiếu nháp' : 'Phiếu đã xác nhận'}</span>
      </div>

      <PageHeader
        title={status === 'draft' ? 'Phiếu điều chỉnh (Nháp)' : 'Phiếu điều chỉnh (Đã xác nhận)'}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={status === 'draft' ? 'draft' : 'confirmed'} size="md" />
            {status === 'draft' && (
              <>
                <button onClick={() => setShowDelete(true)} className="px-3 py-1.5 text-xs font-medium border border-danger text-danger rounded-md hover:bg-danger-soft">
                  <Trash2 className="h-3.5 w-3.5 inline mr-1" /> Xóa nháp
                </button>
                <button onClick={handleSaveDraft} className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">
                  <FileText className="h-3.5 w-3.5 inline mr-1" /> Lưu nháp
                </button>
                <button
                  type="button"
                  data-testid="stock-adj-confirm-open"
                  onClick={() => setShowConfirm(true)}
                  disabled={hasDirectionViolation}
                  title={hasDirectionViolation ? "Hàng hỏng chỉ được giảm tồn" : undefined}
                  className="px-3 py-1.5 text-xs font-medium bg-success text-success-foreground rounded-md hover:bg-success/90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5 inline mr-1" /> Xác nhận
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Status banner */}
      {status === 'draft' && (
        <div className="flex items-center gap-2 p-3 bg-info-soft rounded-lg border border-info/20 text-sm text-info mt-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Phiếu đang ở trạng thái <strong>NHÁP</strong>. Tồn kho chỉ thay đổi sau khi xác nhận.</span>
        </div>
      )}
      {status === 'confirmed' && (
        <div className="flex items-center gap-2 p-3 bg-success-soft rounded-lg border border-success/20 text-sm text-success mt-3">
          <Check className="h-4 w-4 shrink-0" />
          <span>Phiếu đã được xác nhận. Tồn kho đã được cập nhật.</span>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-card rounded-lg border p-4 mt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lý do</label>
            <select
              value={reason}
              onChange={e => {
                const nextReason = e.target.value;
                setReason(nextReason);
                if (nextReason === "Hàng hỏng") {
                  setLines((prev) => prev.map((line) => {
                    const actualQty = Math.min(line.actualQty, line.systemQty);
                    return { ...line, actualQty, difference: actualQty - line.systemQty };
                  }));
                }
              }}
              disabled={status === 'confirmed'}
              className="mt-1 w-full h-8 px-2 text-sm border rounded-md bg-background disabled:opacity-60"
            >
              <option>Kiểm kho định kỳ</option>
              <option>Hàng hỏng</option>
              <option>Sai lệch hệ thống</option>
              <option>Khác</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
            <input value={note} onChange={e => setNote(e.target.value)} disabled={status === 'confirmed'} className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background disabled:opacity-60" />
          </div>
        </div>
      </div>

      {/* Add line */}
      {status === 'draft' && (
        <div className="flex items-start gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") setSuggestions([]);
                if (e.key === 'Enter') void addLine();
              }}
              autoComplete="off"
              data-testid="stock-adj-product-search"
              placeholder="Tìm phân loại / mã / tên sản phẩm… (gợi ý khi gõ)"
              className="w-full h-8 pl-9 pr-3 text-sm bg-card border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {suggestions.length > 0 && (
              <ul
                data-testid="stock-adj-search-suggestions"
                className="absolute z-40 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-card text-xs shadow-md"
              >
                {suggestions.map((p) => (
                  <li key={String(p.variantId)}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/80 border-b last:border-0 border-border/50"
                      onClick={() => addProjectionLine(p)}
                    >
                      <span className="font-medium">{p.productName ?? "—"}</span>
                      <span className="text-muted-foreground"> · {p.variantName ?? p.variantCode ?? ""}</span>
                      {p.variantCode ? (
                        <span className="block font-mono text-[11px] text-muted-foreground">{p.variantCode}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => void addLine()} disabled={!search.trim()} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Thêm
          </button>
        </div>
      )}

      {savedAt && status === 'draft' && (
        <div className="mt-2 text-xs text-muted-foreground">Đã lưu nháp lúc {new Date(savedAt).toLocaleTimeString('vi-VN')}</div>
      )}
      {hasDirectionViolation && (
        <div className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          Hàng hỏng là nghiệp vụ giảm tồn. Vui lòng nhập số thực tế nhỏ hơn hoặc bằng tồn hệ thống.
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">Mặt hàng</p>
          <p className="text-lg font-bold">{lines.length}</p>
        </div>
        <div className="bg-success-soft rounded-lg border border-success/20 p-3 text-center">
          <p className="text-xs text-success">Tăng</p>
          <p className="text-lg font-bold text-success">+{totalPositive}</p>
        </div>
        <div className="bg-danger-soft rounded-lg border border-danger/20 p-3 text-center">
          <p className="text-xs text-danger">Giảm</p>
          <p className="text-lg font-bold text-danger">{totalNegative}</p>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-card rounded-lg border overflow-x-auto mt-3">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Phân loại</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Hệ thống</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Thực tế</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Chênh lệch</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ghi chú</th>
              {status === 'draft' && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id} className={cn("border-b last:border-0 hover:bg-muted/30", l.difference !== 0 && (l.difference > 0 ? "bg-success-soft/30" : "bg-danger-soft/30"))}>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-xs">{l.productName}</p>
                  <p className="text-[11px] text-muted-foreground">{l.variantName} · {l.variantCode}</p>
                </td>
                <td className="px-3 py-2.5 text-center font-medium">{l.systemQty}</td>
                <td className="px-3 py-2.5 text-center">
                  {status === 'draft' ? (
                    <input
                      type="number"
                      min={0}
                      max={isDamageReason ? l.systemQty : undefined}
                      data-testid="stock-adj-line-actual-qty"
                      value={l.actualQty}
                      onChange={e => updateLineActualQty(l.id, Number(e.target.value))}
                      className="w-16 h-7 text-center text-xs border rounded bg-background"
                    />
                  ) : (
                    <span className="font-medium">{l.actualQty}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={cn("font-bold text-sm", l.difference > 0 ? "text-success" : l.difference < 0 ? "text-danger" : "text-muted-foreground")}>
                    {l.difference > 0 ? `+${l.difference}` : l.difference}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {status === 'draft' ? (
                    <input value={l.note} onChange={e => setLines(prev => prev.map(x => x.id === l.id ? { ...x, note: e.target.value } : x))} className="w-full h-7 text-xs border rounded bg-background px-2" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{l.note}</span>
                  )}
                </td>
                {status === 'draft' && (
                  <td className="px-3 py-2.5">
                    <button onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} className="p-0.5 text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile sticky actions */}
      {status === 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-card border-t lg:hidden z-30 flex gap-2">
          <button onClick={handleSaveDraft} className="flex-1 py-2 text-sm font-medium border rounded-md hover:bg-muted">Lưu nháp</button>
          <button type="button" data-testid="stock-adj-confirm-open" onClick={() => setShowConfirm(true)} className="flex-1 py-2 text-sm font-semibold bg-success text-success-foreground rounded-md">Xác nhận</button>
        </div>
      )}

      <ConfirmDialog open={showConfirm} onClose={() => setShowConfirm(false)} onConfirm={handleConfirm} title="Xác nhận phiếu điều chỉnh?" description="Sau khi xác nhận, tồn kho sẽ được cập nhật và không thể hoàn tác. Hãy kiểm tra lại trước khi xác nhận." confirmLabel="Xác nhận điều chỉnh" variant="warning" />
      <ConfirmDialog open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Xóa phiếu nháp?" description="Phiếu nháp này sẽ bị xóa vĩnh viễn." confirmLabel="Xóa" variant="danger" />
    </div>
  );
}
