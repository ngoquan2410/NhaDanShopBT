import { useEffect, useMemo, useState } from "react";
import { X, Printer, FileInput, Calendar, Truck, Barcode } from "lucide-react";
import { formatVND, formatDate } from "@/lib/format";
import { BlockedActionBanner } from "@/components/shared/BlockedActionBanner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { GoodsReceipt, GoodsReceiptLine } from "@/services/types";
import { Printable58Receipt } from "@/components/shared/Printable58Receipt";
import { BarcodePrintDialog } from "@/components/shared/BarcodePrintDialog";
import type { BarcodeItem } from "@/components/shared/BarcodePrintDialog";
import { triggerPrint } from "@/lib/print";
import { goodsReceipts as goodsReceiptsService } from "@/services";
import { fetchBatchesByReceiptId } from "@/services/batches/batchReceiptApi";
import { toast } from "sonner";

interface Props {
  receipt: GoodsReceipt | null;
  onClose: () => void;
  /** Refresh list row after void */
  onReceiptChanged?: () => void;
}

interface CostRow {
  line: GoodsReceiptLine;
  unitGross: number;
  afterDiscount: number;
  unitAfterDiscount: number;
  shippingAlloc: number;
  unitShippingAlloc: number;
  vatAlloc: number;
  unitVatAlloc: number;
  finalUnitCost: number;
  finalLineCost: number;
}

/** Build cost breakdown from BE fields when present, else allocate
 *  proportionally using afterDiscount as the basis. */
function buildCostRows(receipt: GoodsReceipt, lines: GoodsReceiptLine[]): CostRow[] {
  const subtotals = lines.map((l) =>
    l.afterDiscount ?? l.quantity * l.unitCost * (1 - l.discountPercent / 100)
  );
  const basisTotal = subtotals.reduce((s, v) => s + v, 0) || 1;

  const shipAllocs: number[] = [];
  const vatAllocs: number[] = [];
  let shipUsed = 0;
  let vatUsed = 0;
  lines.forEach((l, i) => {
    const isLast = i === lines.length - 1;
    if (l.shippingAlloc != null) {
      shipAllocs.push(l.shippingAlloc);
      shipUsed += l.shippingAlloc;
    } else if (isLast) {
      shipAllocs.push(receipt.shippingFee - shipUsed);
    } else {
      const a = Math.round((subtotals[i] / basisTotal) * receipt.shippingFee);
      shipAllocs.push(a);
      shipUsed += a;
    }
    if (l.vatAlloc != null) {
      vatAllocs.push(l.vatAlloc);
      vatUsed += l.vatAlloc;
    } else if (isLast) {
      vatAllocs.push(receipt.vat - vatUsed);
    } else {
      const a = Math.round((subtotals[i] / basisTotal) * receipt.vat);
      vatAllocs.push(a);
      vatUsed += a;
    }
  });

  return lines.map((l, i) => {
    const afterDiscount = subtotals[i];
    const ship = shipAllocs[i];
    const vat = vatAllocs[i];
    const finalLineCost = afterDiscount + ship + vat;
    const finalUnitCost = l.finalUnitCost ?? (l.quantity > 0 ? finalLineCost / l.quantity : 0);
    const qty = l.quantity > 0 ? l.quantity : 1;
    return {
      line: l,
      unitGross: l.unitCost,
      afterDiscount,
      unitAfterDiscount: afterDiscount / qty,
      shippingAlloc: ship,
      unitShippingAlloc: ship / qty,
      vatAlloc: vat,
      unitVatAlloc: vat / qty,
      finalUnitCost,
      finalLineCost,
    };
  });
}

export function GoodsReceiptDetailDrawer({ receipt, onClose, onReceiptChanged }: Props) {
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeItems, setBarcodeItems] = useState<BarcodeItem[]>([]);
  const [lines, setLines] = useState<GoodsReceiptLine[]>([]);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!receipt) {
      setLines([]);
      return;
    }
    goodsReceiptsService.getLines(receipt.id).then((rows) => {
      if (!cancelled) setLines(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  const rows = useMemo(() => (receipt ? buildCostRows(receipt, lines) : []), [receipt, lines]);

  if (!receipt) return null;

  const subtotal = rows.reduce((s, r) => s + r.afterDiscount, 0);
  const grandTotal = subtotal + receipt.shippingFee + receipt.vat;

  const handlePrint58 = () =>
    triggerPrint(`phiếu nhập ${receipt.number} (POS58)`, "pos58", { targetId: "print-root-receipt-pos58" });

  const isVoided = receipt.status === "voided";

  const openBarcode = async () => {
    try {
      const batches = await fetchBatchesByReceiptId(Number(receipt.id));
      const mapped: BarcodeItem[] =
        batches.length > 0
          ? batches.map((b) => {
              const line =
                lines.find((l) => String(l.productCode ?? "").toUpperCase() === String(b.productCode ?? "").toUpperCase()) ??
                lines[0];
              const expRaw = b.expiryDate;
              const expiryLabel =
                typeof expRaw === "string" && expRaw.length >= 10 ? formatDate(expRaw.slice(0, 10)) : undefined;
              return {
                productName: b.productName ?? line?.productName ?? "—",
                variantName: line?.variantName,
                code: `BATCH:${b.id}`,
                price: line?.variantSellPrice,
                lot: receipt.number,
                expiryDate: expiryLabel,
                defaultQty: Math.max(1, (line?.quantity ?? 1) * (line?.piecesPerUnit || 1)),
              };
            })
          : lines.map((l) => ({
              productName: l.productName,
              variantName: l.variantName,
              code: l.variantCode,
              price: l.variantSellPrice,
              lot: receipt.number,
              expiryDate: l.expiryDate ? formatDate(l.expiryDate) : undefined,
              defaultQty: Math.max(1, l.quantity * (l.piecesPerUnit || 1)),
            }));
      setBarcodeItems(mapped);
      setBarcodeOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được lô cho mã vạch");
    }
  };

  const runVoid = async () => {
    try {
      setVoiding(true);
      await goodsReceiptsService.voidReceipt(receipt.id, {
        reason: "e2e-admin-void",
        voidedBy: "selenium",
      });
      toast.success("Đã hủy (void) phiếu nhập");
      onReceiptChanged?.();
      setVoidOpen(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không void được phiếu");
      throw e;
    } finally {
      setVoiding(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end no-print">
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-3xl bg-card border-l shadow-xl flex flex-col animate-slide-in-right">
          <div className="p-4 border-b flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <FileInput className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm font-mono" data-testid="goods-receipt-detail-number">
                  {receipt.number}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{receipt.supplierName}</p>
            </div>
            <button type="button" onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> Ngày nhập: {formatDate(receipt.date)}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="h-3.5 w-3.5" /> NCC: {receipt.supplierName}
              </div>
              {receipt.note && <div className="text-xs text-muted-foreground italic">"{receipt.note}"</div>}
              {isVoided && (
                <BlockedActionBanner message="Phiếu đã void — không xóa cứng; tồn đã điều chỉnh theo lô còn lại." />
              )}
            </div>

            {!receipt.canDelete && !isVoided && (
              <BlockedActionBanner message="Không thể xóa phiếu — một phần hàng nhập đã được bán ra" />
            )}

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Mặt hàng ({receipt.itemCount}) — phân bổ chi phí từ phiếu nhập
              </h3>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Sản phẩm</th>
                      <th className="p-2 font-medium text-center">SL</th>
                      <th className="p-2 font-medium text-right">Đơn giá gốc</th>
                      <th className="p-2 font-medium text-right">CK %</th>
                  <th className="p-2 font-medium text-right">Sau CK / ĐV</th>
                  <th className="p-2 font-medium text-right">+ Ship / ĐV</th>
                  <th className="p-2 font-medium text-right">+ VAT / ĐV</th>
                      <th className="p-2 font-medium text-right">Giá vốn cuối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.line.id} className="align-top">
                        <td className="p-2">
                          <p className="font-medium">{r.line.productName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {r.line.variantName} · <span className="font-mono">{r.line.variantCode}</span>
                            {r.line.discountPercent > 0 && <> · CK {r.line.discountPercent}%</>}
                            {r.line.expiryDate && <> · HSD {formatDate(r.line.expiryDate)}</>}
                          </p>
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          {r.line.quantity} {r.line.importUnit}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">{formatVND(r.unitGross)}</td>
                        <td className="p-2 text-right whitespace-nowrap">{r.line.discountPercent}%</td>
                        <td className="p-2 text-right whitespace-nowrap">{formatVND(r.unitAfterDiscount)}</td>
                        <td className="p-2 text-right whitespace-nowrap text-muted-foreground">
                          {formatVND(r.unitShippingAlloc)}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap text-muted-foreground">
                          {formatVND(r.unitVatAlloc)}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap font-semibold text-primary">
                          {formatVND(r.finalUnitCost)}
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            / {r.line.importUnit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tạm tính (sau CK)</span>
                <span>{formatVND(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phí vận chuyển</span>
                <span>{formatVND(receipt.shippingFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span>{formatVND(receipt.vat)}</span>
              </div>
              <div className="border-t pt-1.5 flex justify-between font-bold text-base">
                <span>Tổng cộng</span>
                <span className="text-primary">{formatVND(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 border-t flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="goods-receipt-barcode-open"
              onClick={() => void openBarcode()}
              className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border rounded-md hover:bg-muted"
            >
              <Barcode className="h-4 w-4" /> Mã vạch
            </button>
            <button
              type="button"
              onClick={handlePrint58}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"
            >
              <Printer className="h-4 w-4" /> In POS58
            </button>
            {!isVoided && (
              <button
                type="button"
                data-testid="goods-receipt-void-open"
                onClick={() => setVoidOpen(true)}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-warning text-warning rounded-md hover:bg-warning-soft"
              >
                Void phiếu
              </button>
            )}
          </div>
        </div>
      </div>

      <Printable58Receipt receipt={receipt} lines={lines} />

      <BarcodePrintDialog
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        title={`In mã vạch — ${receipt.number}`}
        items={barcodeItems}
      />

      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={() => runVoid()}
        title="Hủy (void) phiếu nhập?"
        description="Trừ tồn theo phần còn lại của từng lô thuộc phiếu; không xóa lịch sử. Thao tác cần quyền admin."
        confirmLabel={voiding ? "Đang xử lý…" : "Xác nhận void"}
        variant="danger"
      />
    </>
  );
}
