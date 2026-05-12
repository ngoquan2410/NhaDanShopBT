import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { adminFetchJson, AdminApiError } from "@/services/auth/adminApi";
import { inventory } from "@/services";
import type { InventoryProjection, InventoryProjectionBatch } from "@/services/types";
import { VariantSearchPicker } from "@/components/shared/VariantSearchPicker";
import type { VariantTransactionSearchHit } from "@/services/catalog/variantTransactionSearch";
import {
  ArrowLeft, Check, Trash2, AlertTriangle, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ReasonKey = "STOCKTAKE" | "DAMAGED" | "EXPIRED" | "LOST" | "OTHER_MISC" | "OTHER_RECEIPT";

const REASON_DEF: Record<
  ReasonKey,
  { label: string; api: string; allowsIncrease: boolean; feRequireSourceWhenNegative: boolean }
> = {
  STOCKTAKE: {
    label: "Kiểm kê định kỳ",
    api: "PERIODIC_STOCKTAKE",
    allowsIncrease: true,
    feRequireSourceWhenNegative: true,
  },
  DAMAGED: {
    label: "Hàng hỏng",
    api: "DAMAGED",
    allowsIncrease: false,
    feRequireSourceWhenNegative: true,
  },
  EXPIRED: {
    label: "Hết hạn",
    api: "EXPIRED",
    allowsIncrease: false,
    feRequireSourceWhenNegative: true,
  },
  LOST: {
    label: "Mất hàng",
    api: "LOST",
    allowsIncrease: false,
    feRequireSourceWhenNegative: true,
  },
  OTHER_RECEIPT: {
    label: "Sai phiếu nhập",
    api: "WRONG_RECEIPT",
    allowsIncrease: true,
    feRequireSourceWhenNegative: true,
  },
  OTHER_MISC: {
    label: "Khác",
    api: "OTHER",
    allowsIncrease: true,
    feRequireSourceWhenNegative: false,
  },
};

type BatchCacheEntry =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; batches: InventoryProjectionBatch[] };

function eligibleBatchForSource(b: InventoryProjectionBatch): boolean {
  const s = b.status?.toLowerCase();
  return !s || s === "active" || s === "blocked";
}

function isBatchScopedReason(key: ReasonKey): boolean {
  return key === "OTHER_RECEIPT" || key === "STOCKTAKE";
}

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
    sourceBatchId: string | null;
  }>>([]);
  const [reasonKey, setReasonKey] = useState<ReasonKey>("STOCKTAKE");
  const [note, setNote] = useState("Kiểm kho tháng 4/2025");
  const [batchCache, setBatchCache] = useState<Record<string, BatchCacheEntry>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const projectionRequestsRef = useRef<Map<string, Promise<void>>>(new Map());

  const reasonMeta = REASON_DEF[reasonKey];
  const batchScopedReason = isBatchScopedReason(reasonKey);

  const loadBatchesForVariant = useCallback(async (variantId: string) => {
    const existing = batchCache[variantId];
    if (existing?.status === "ready" || existing?.status === "loading") return;
    const inFlight = projectionRequestsRef.current.get(variantId);
    if (inFlight) return inFlight;
    setBatchCache((prev) => ({ ...prev, [variantId]: { status: "loading" } }));
    const request = (async () => {
      const proj = await inventory.getInventoryProjection(variantId);
      const raw = proj?.byBatch ?? [];
      const batches = raw.filter(eligibleBatchForSource);
      setBatchCache((prev) => ({ ...prev, [variantId]: { status: "ready", batches } }));
      setLines((prev) =>
        prev.map((line) => {
          if (line.variantId !== variantId || !line.sourceBatchId) return line;
          const still = batches.some((b) => b.batchId === line.sourceBatchId);
          return still
            ? line
            : {
                ...line,
                sourceBatchId: null,
              };
        }),
      );
    })().catch(() => {
      setBatchCache((prev) => ({
        ...prev,
        [variantId]: { status: "error", message: "Không tải được danh sách lô cho biến thể này." },
      }));
    }).finally(() => {
      projectionRequestsRef.current.delete(variantId);
    });
    projectionRequestsRef.current.set(variantId, request);
    return request;
  }, [batchCache]);

  const variantIdsKey = [...new Set(lines.map((l) => l.variantId))].sort().join(",");

  useEffect(() => {
    const ids = variantIdsKey ? variantIdsKey.split(",") : [];
    for (const vid of ids) {
      void loadBatchesForVariant(vid);
    }
  }, [variantIdsKey, loadBatchesForVariant]);

  const handleSaveDraft = () => {
    if (lines.length === 0) {
      toast.error("Chưa có mặt hàng nào để lưu nháp");
      return;
    }
    setSavedAt(new Date().toISOString());
    toast.success("Đã lưu nháp phiếu điều chỉnh");
  };

  const validateBeforeSubmit = (): string | null => {
    const def = REASON_DEF[reasonKey];
    const batchScoped = isBatchScopedReason(reasonKey);
    for (const line of lines) {
      if (line.difference === 0) continue;
      if (!batchScoped && !(line.difference < 0 && def.feRequireSourceWhenNegative)) continue;
      const cache = batchCache[line.variantId];
      if (cache?.status === "loading") {
        return "Đang tải danh sách lô — vui lòng đợi trước khi xác nhận.";
      }
      if (cache?.status === "error") {
        return cache.message;
      }
      const eligible = cache?.status === "ready" ? cache.batches : [];
      if (eligible.length === 0) {
        return `Biến thể ${line.variantCode}: không có lô active/blocked còn tồn để giảm theo lý do đã chọn.`;
      }
      if (!line.sourceBatchId) {
        return batchScoped
          ? "Vui lòng chọn Lô điều chỉnh cho lý do Sai phiếu nhập/Kiểm kê định kỳ."
          : "Vui lòng chọn lô nguồn cho dòng điều chỉnh âm.";
      }
      const sel = eligible.find((b) => b.batchId === line.sourceBatchId);
      if (!sel) {
        return "Lô đã chọn không thuộc biến thể này hoặc không còn đủ tồn.";
      }
      const need = line.difference < 0 ? -line.difference : 0;
      if (need > 0 && need > sel.qty) {
        return "Số lượng giảm vượt quá tồn còn lại của lô đã chọn.";
      }
    }
    return null;
  };

  const handleConfirm = async () => {
    if (hasDirectionViolation) {
      toast.error("Lý do đã chọn chỉ được giảm tồn, không được tăng số lượng.");
      return;
    }
    const ve = validateBeforeSubmit();
    if (ve) {
      toast.error(ve);
      return;
    }
    try {
      const def = REASON_DEF[reasonKey];
      const created = await adminFetchJson<{ id: number }>("/api/stock-adjustments", {
        method: "POST",
        body: JSON.stringify({
          reason: def.api,
          note,
          items: lines.map((line) => {
            const row: {
              variantId: number;
              actualQty: number;
              note: string | null;
              sourceBatchId?: number;
            } = {
              variantId: Number(line.variantId),
              actualQty: line.actualQty,
              note: line.note || null,
            };
            if (line.sourceBatchId && (line.difference < 0 || batchScopedReason)) {
              row.sourceBatchId = Number(line.sourceBatchId);
            }
            return row;
          }),
        }),
      });
      await adminFetchJson(`/api/stock-adjustments/${created.id}/confirm`, {
        method: "PUT",
      });
      setStatus('confirmed');
      toast.success("Đã xác nhận phiếu — tồn kho đã được cập nhật");
      navigate('/admin/stock-adjustments');
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Không thể tạo phiếu điều chỉnh";
      toast.error(msg);
      throw err;
    }
  };

  const handleDelete = () => {
    toast.success("Đã xóa phiếu nháp");
    navigate('/admin/stock-adjustments');
  };

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
        sourceBatchId: null,
      },
    ]);
    setBatchCache((prev) => ({
      ...prev,
      [projection.variantId]: { status: "ready", batches: (projection.byBatch ?? []).filter(eligibleBatchForSource) },
    }));
    toast.success(`Đã thêm "${projection.productName ?? projection.variantCode}" vào phiếu`);
  };

  const addLineFromVariantHit = async (hit: VariantTransactionSearchHit) => {
    if (lines.some((l) => l.variantId === hit.variantId)) {
      toast.error("Phân loại đã có trong phiếu");
      return;
    }
    let proj: InventoryProjection | null = null;
    try {
      proj = await inventory.getInventoryProjection(hit.variantId);
    } catch {
      proj = null;
    }
    const onHand = proj?.onHand ?? hit.stockQty;
    const projection: InventoryProjection =
      proj ??
      {
        variantId: hit.variantId,
        productId: hit.productId,
        productCode: hit.productCode,
        productName: hit.productName,
        variantCode: hit.variantCode,
        variantName: hit.variantName,
        sellUnit: hit.sellUnit,
        onHand,
        reserved: 0,
        available: onHand,
        byBatch: [],
      };
    addProjectionLine(projection);
  };

  const totalPositive = lines.filter(l => l.difference > 0).reduce((s, l) => s + l.difference, 0);
  const totalNegative = lines.filter(l => l.difference < 0).reduce((s, l) => s + l.difference, 0);
  const hasDirectionViolation = !reasonMeta.allowsIncrease && lines.some((l) => l.difference > 0);

  const updateLineActualQty = (lineId: string, rawValue: number) => {
    setLines((prev) => prev.map((line) => {
      if (line.id !== lineId) return line;
      const cap = !reasonMeta.allowsIncrease ? Math.min(rawValue, line.systemQty) : rawValue;
      const actualQty = cap;
      const difference = actualQty - line.systemQty;
      return {
        ...line,
        actualQty,
        difference,
        sourceBatchId: batchScopedReason || difference < 0 ? line.sourceBatchId : null,
      };
    }));
  };

  const onReasonChange = (next: ReasonKey) => {
    setReasonKey(next);
    const allows = REASON_DEF[next].allowsIncrease;
    const nextBatchScoped = isBatchScopedReason(next);
    setLines((prev) => prev.map((line) => {
      const actualQty = allows ? line.actualQty : Math.min(line.actualQty, line.systemQty);
      const difference = actualQty - line.systemQty;
      return {
        ...line,
        actualQty,
        difference,
        sourceBatchId: nextBatchScoped ? line.sourceBatchId : null,
      };
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
                  title={hasDirectionViolation ? "Lý do này chỉ được giảm tồn" : undefined}
                  className="px-3 py-1.5 text-xs font-medium bg-success text-success-foreground rounded-md hover:bg-success/90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5 inline mr-1" /> Xác nhận
                </button>
              </>
            )}
          </div>
        }
      />

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

      <div className="bg-card rounded-lg border p-4 mt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lý do</label>
            <select
              value={reasonKey}
              onChange={e => onReasonChange(e.target.value as ReasonKey)}
              disabled={status === 'confirmed'}
              className="mt-1 w-full h-8 px-2 text-sm border rounded-md bg-background disabled:opacity-60"
            >
              {(Object.keys(REASON_DEF) as ReasonKey[]).map((k) => (
                <option key={k} value={k}>{REASON_DEF[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ghi chú</label>
            <input value={note} onChange={e => setNote(e.target.value)} disabled={status === 'confirmed'} className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background disabled:opacity-60" />
          </div>
        </div>
      </div>

      {status === 'draft' && (
        <div className="flex items-start gap-2 mt-3">
          <div className="relative flex-1">
            <VariantSearchPicker
              context="stock_adjustment"
              className="w-full"
              placeholder="Tìm variant / SP (backend) — chọn dòng để tải tồn & lô"
              inputTestId="stock-adj-product-search"
              listTestId="stock-adj-search-suggestions"
              onSelect={(hit) => void addLineFromVariantHit(hit)}
            />
          </div>
        </div>
      )}

      {savedAt && status === 'draft' && (
        <div className="mt-2 text-xs text-muted-foreground">Đã lưu nháp lúc {new Date(savedAt).toLocaleTimeString('vi-VN')}</div>
      )}
      {hasDirectionViolation && (
        <div className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          Lý do đã chọn chỉ cho phép giảm tồn. Vui lòng nhập số thực tế nhỏ hơn hoặc bằng tồn hệ thống.
        </div>
      )}

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

      <div className="bg-card rounded-lg border overflow-x-auto mt-3">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Phân loại</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Hệ thống</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Thực tế</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Chênh lệch</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[240px]">{batchScopedReason ? "Lô điều chỉnh" : "Lô nguồn (giảm)"}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ghi chú</th>
              {status === 'draft' && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const cache = batchCache[l.variantId];
              const eligible = cache?.status === "ready" ? cache.batches : [];
              const showBatch =
                status === "draft" &&
                (batchScopedReason || (l.difference < 0 && reasonMeta.feRequireSourceWhenNegative));
              const selectedBatch = eligible.find((b) => b.batchId === l.sourceBatchId);
              return (
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
                        max={!reasonMeta.allowsIncrease ? l.systemQty : undefined}
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
                  <td className="px-3 py-2.5 align-top">
                    {showBatch ? (
                      <div className="space-y-1">
                        {cache?.status === "loading" && (
                          <p className="text-[11px] text-muted-foreground">Đang tải lô…</p>
                        )}
                        {cache?.status === "error" && (
                          <p className="text-[11px] text-danger">{cache.message}</p>
                        )}
                        {cache?.status === "ready" && eligible.length === 0 && (
                          <p className="text-[11px] text-danger">Không có lô khả dụng (active/blocked) để trừ.</p>
                        )}
                        {cache?.status === "ready" && eligible.length > 0 && (
                          <select
                            data-testid={`stock-adj-batch-select-${l.id}`}
                            className="w-full max-w-[240px] h-7 text-[11px] border rounded bg-background px-1"
                            value={l.sourceBatchId ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.id === l.id
                                    ? (() => {
                                        if (v === "") return { ...x, sourceBatchId: null };
                                        const batch = eligible.find((b) => b.batchId === v);
                                        if (batchScopedReason && batch) {
                                          return { ...x, sourceBatchId: v, systemQty: batch.qty, actualQty: batch.qty, difference: 0 };
                                        }
                                        return { ...x, sourceBatchId: v };
                                      })()
                                    : x,
                                ),
                              );
                            }}
                          >
                            <option value="">— Chọn lô —</option>
                            {eligible.map((b) => {
                              const hsd = b.expiryDate
                                ? new Date(b.expiryDate).toLocaleDateString("vi-VN")
                                : "—";
                              const nhap = b.createdAt
                                ? new Date(b.createdAt).toLocaleString("vi-VN")
                                : "—";
                              const rc = b.receiptId ? `PN #${b.receiptId}` : "";
                              const label = `${b.batchCode ?? b.batchId} · SL: ${b.qty} · HSD: ${hsd} · Nhập: ${nhap}${rc ? ` · ${rc}` : ""}`;
                              return (
                                <option key={b.batchId} value={b.batchId}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        )}
                        {batchScopedReason && selectedBatch && (
                          <p className="text-[11px] text-muted-foreground">
                            Lô đã chọn: {selectedBatch.batchCode ?? selectedBatch.batchId} · tồn hiện tại {selectedBatch.qty}
                            {selectedBatch.expiryDate ? ` · HSD ${new Date(selectedBatch.expiryDate).toLocaleDateString("vi-VN")}` : ""}
                          </p>
                        )}
                        {batchScopedReason && !l.sourceBatchId && (
                          <p className="text-[11px] text-warning">Chọn lô trước khi nhập số thực tế.</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
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
                      <button
                        type="button"
                        onClick={() => {
                          setLines((prev) => prev.filter((x) => x.id !== l.id));
                        }}
                        className="p-0.5 text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {status === 'draft' && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-card border-t lg:hidden z-30 flex gap-2">
          <button type="button" onClick={handleSaveDraft} className="flex-1 py-2 text-sm font-medium border rounded-md hover:bg-muted">Lưu nháp</button>
          <button type="button" data-testid="stock-adj-confirm-open" onClick={() => setShowConfirm(true)} className="flex-1 py-2 text-sm font-semibold bg-success text-success-foreground rounded-md">Xác nhận</button>
        </div>
      )}

      <ConfirmDialog open={showConfirm} onClose={() => setShowConfirm(false)} onConfirm={handleConfirm} title="Xác nhận phiếu điều chỉnh?" description="Sau khi xác nhận, tồn kho sẽ được cập nhật và không thể hoàn tác. Hãy kiểm tra lại trước khi xác nhận." confirmLabel="Xác nhận điều chỉnh" variant="warning" />
      <ConfirmDialog open={showDelete} onClose={() => setShowDelete(false)} onConfirm={handleDelete} title="Xóa phiếu nháp?" description="Phiếu nháp này sẽ bị xóa vĩnh viễn." confirmLabel="Xóa" variant="danger" />
    </div>
  );
}
