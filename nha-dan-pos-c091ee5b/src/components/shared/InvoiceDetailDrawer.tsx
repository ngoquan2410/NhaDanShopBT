import { X, Printer, Receipt, User, Calendar, CreditCard, Gift, Tag, Truck, Percent, Sparkles } from "lucide-react";
import { formatVND, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import type { Invoice, InvoiceLine } from "@/lib/mock-data";
import { Printable58Invoice } from "@/components/shared/Printable58Invoice";
import { triggerPrint } from "@/lib/print";

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
}

// Fallback mock lines for legacy invoices (without snapshot lines)
function getMockLines(inv: Invoice): InvoiceLine[] {
  const sample: InvoiceLine[] = [
    { name: 'Mì Hảo Hảo - Tôm chua cay', code: 'SP001-01', qty: 5, price: 5000 },
    { name: 'Coca-Cola - Lon 330ml', code: 'SP002-01', qty: 3, price: 10000 },
    { name: 'Sữa Vinamilk - Hộp 180ml', code: 'SP003-01', qty: 2, price: 8000 },
    { name: 'Bánh Oreo - Gói 133g', code: 'SP004-01', qty: 4, price: 22000 },
  ];
  return sample.slice(0, Math.max(1, Math.min(inv.itemCount, sample.length)));
}

export function InvoiceDetailDrawer({ invoice, onClose }: Props) {
  if (!invoice) return null;

  // Use snapshot when present (POS-generated). Fallback to mock for legacy.
  const lines: InvoiceLine[] = invoice.lines && invoice.lines.length > 0 ? invoice.lines : getMockLines(invoice);
  const billable = lines.filter((l) => !l.reward);
  const rewards = lines.filter((l) => l.reward);
  const computedSubtotal = billable.reduce((s, l) => s + l.qty * l.price, 0);

  // Source-of-truth: stored breakdown from POS. Fallback derives a minimal one from totals.
  const b = invoice.breakdown ?? {
    subtotal: computedSubtotal,
    manualDiscount: 0,
    promoDiscount: Math.max(0, computedSubtotal - invoice.total),
    promoName: undefined,
    voucherDiscount: 0,
    voucherName: undefined,
    shippingFee: 0,
    shippingDiscount: 0,
    shippingPayable: 0,
    vatPercent: 0,
    vatBase: invoice.total,
    vatAmount: 0,
    total: invoice.total,
    freeItems: [],
  };

  // Resolve full promotion record by name (best-effort) for richer detail panel.
  const voucherDiscount = b.voucherDiscount ?? 0;
  const loyaltyDiscount = Number((b as { loyaltyDiscount?: number }).loyaltyDiscount ?? 0);
  const loyaltyRedeemedPoints = Number((b as { loyaltyRedeemedPoints?: number }).loyaltyRedeemedPoints ?? 0);
  const hasManual = b.manualDiscount > 0;
  const hasPromoDiscount = b.promoDiscount > 0;
  const hasVoucherDiscount = voucherDiscount > 0;
  const hasShipDiscount = b.shippingDiscount > 0;
  const hasFreeItems = (b.freeItems?.length ?? 0) > 0 || rewards.length > 0;
  const hasAnyPromotion = !!b.promoName || !!b.voucherName || hasManual || hasPromoDiscount || hasVoucherDiscount || hasShipDiscount || hasFreeItems;

  const totalPromoImpact = b.manualDiscount + b.promoDiscount + voucherDiscount + loyaltyDiscount + b.shippingDiscount;


  const discountedLines = b.discountedLines ?? [];
  const giftLines = b.giftLines ?? [];

  // Promotion rule text + scope text
  const ruleText = b.promoName ? "Khuyến mãi áp dụng từ snapshot hóa đơn backend" : "";
  const scopeText = "";

  const handlePrint58 = () => triggerPrint(`hóa đơn ${invoice.number} (POS58)`, "pos58", { targetId: "print-root-invoice-pos58" });

  return (
    <>
      <div className="fixed inset-0 z-50 flex justify-end no-print">
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-card border-l shadow-xl flex flex-col animate-slide-in-right">
          <div className="p-4 border-b flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm font-mono">{invoice.number}</h2>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge status={invoice.status === 'cancelled' ? 'cancelled' : 'active'} />
                <StatusBadge status={invoice.paymentType} />
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {formatDateTime(invoice.date)}</div>
              <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" /> {invoice.customerName}</div>
              <div className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> Người tạo: {invoice.createdBy}</div>
              {invoice.note && <div className="text-xs text-muted-foreground italic">Ghi chú: {invoice.note}</div>}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Sản phẩm ({billable.length})</h3>
              <div className="border rounded-lg divide-y">
                {billable.map((l, i) => (
                  <div key={i} className="p-3 flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.code} · {l.qty} × {formatVND(l.price)}</p>
                    </div>
                    <span className="font-medium shrink-0">{formatVND(l.qty * l.price)}</span>
                  </div>
                ))}
              </div>
            </div>

            {rewards.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-warning uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Gift className="h-3 w-3" /> Quà tặng / Khuyến mãi ({rewards.length})
                </h3>
                <div className="border border-warning/30 bg-warning-soft/30 rounded-lg divide-y divide-warning/20">
                  {rewards.map((l, i) => (
                    <div key={i} className="p-3 flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.code} · SL {l.qty}{l.rewardSource ? ` · từ "${l.rewardSource}"` : ""}</p>
                      </div>
                      <span className="text-xs font-medium text-warning shrink-0">Miễn phí</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasAnyPromotion && (
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-primary/5 border-b flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Chi tiết khuyến mãi
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {b.promoName ? (
                      <Badge variant="secondary" className="text-[10px] h-5">Đã áp dụng</Badge>
                    ) : null}
                  </div>
                </div>

                {(b.promoName || ruleText) && (
                  <div className="px-3 py-2.5 border-b space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Tên chương trình</div>
                        <div className="text-sm font-medium truncate">{b.promoName ?? "—"}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] h-5 shrink-0 text-success border-success/40">
                        Đã áp dụng
                      </Badge>
                    </div>
                    {ruleText && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Quy tắc: </span>{ruleText}
                      </div>
                    )}
                    {scopeText && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Phạm vi: </span>{scopeText}
                      </div>
                    )}
                  </div>
                )}

                <div className="px-3 py-2.5 border-b space-y-1 text-sm">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Tác động tài chính
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><Percent className="h-3 w-3" /> Chiết khấu thủ công</span>
                    <span className={hasManual ? "text-danger" : "text-muted-foreground"}>{hasManual ? `-${formatVND(b.manualDiscount)}` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><Tag className="h-3 w-3" /> Giảm từ khuyến mãi</span>
                    <span className={hasPromoDiscount ? "text-danger" : "text-muted-foreground"}>{hasPromoDiscount ? `-${formatVND(b.promoDiscount)}` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><Tag className="h-3 w-3" /> Giảm từ voucher{b.voucherName ? ` (${b.voucherName})` : ""}</span>
                    <span className={hasVoucherDiscount ? "text-danger" : "text-muted-foreground"}>{hasVoucherDiscount ? `-${formatVND(voucherDiscount)}` : "—"}</span>
                  </div>
                  {loyaltyDiscount > 0 && (
                    <div className="flex justify-between" data-testid="invoice-loyalty-discount">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        Đổi điểm ({loyaltyRedeemedPoints} điểm)
                      </span>
                      <span className="text-danger" data-testid="loyalty-redeemed-points">
                        -{formatVND(loyaltyDiscount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1 text-muted-foreground"><Truck className="h-3 w-3" /> Ưu đãi ship</span>
                    <span className={hasShipDiscount ? "text-success" : "text-muted-foreground"}>{hasShipDiscount ? `-${formatVND(b.shippingDiscount)}` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT ({b.vatPercent || 0}%)</span>
                    <span className={b.vatAmount > 0 ? "" : "text-muted-foreground"}>{b.vatAmount > 0 ? `+${formatVND(b.vatAmount)}` : "—"}</span>
                  </div>
                  <div className="border-t pt-1.5 mt-1 flex justify-between font-semibold">
                    <span>Tổng ưu đãi / giảm trừ</span>
                    <span className="text-primary">-{formatVND(totalPromoImpact)}</span>
                  </div>
                </div>

                {(discountedLines.length > 0 || giftLines.length > 0) && (
                  <div className="px-3 py-2.5 border-b">
                    {discountedLines.length > 0 && (
                      <>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Sản phẩm được giảm
                        </div>
                        <div className="rounded-md border divide-y mb-2">
                          {discountedLines.map((line, idx) => (
                            <div key={`${line.productName}-${idx}`} className="p-2 flex items-center justify-between text-xs">
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {line.productName}
                                  {line.variantName ? ` · ${line.variantName}` : ""}
                                </p>
                              </div>
                              <span className="text-danger font-medium">-{formatVND(line.discountedAmount)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {giftLines.length > 0 && (
                      <>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Quà tặng
                        </div>
                        <div className="rounded-md border divide-y">
                          {giftLines.map((line, idx) => (
                            <div key={`${line.productName}-${idx}`} className="p-2 flex items-center justify-between text-xs bg-warning-soft/20">
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {line.productName}
                                  {line.variantName ? ` · ${line.variantName}` : ""}
                                </p>
                              </div>
                              <span className="text-warning font-medium">x{line.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {(b.shippingFee > 0 || hasShipDiscount) && (
                  <div className="px-3 py-2.5 space-y-1 text-sm">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Vận chuyển
                    </div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Phí ship gốc</span><span>{formatVND(b.shippingFee)}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ưu đãi ship</span>
                      <span className={hasShipDiscount ? "text-success" : "text-muted-foreground"}>{hasShipDiscount ? `-${formatVND(b.shippingDiscount)}` : "—"}</span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between font-medium"><span>Phí ship sau ưu đãi</span><span>{formatVND(b.shippingPayable)}</span></div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tạm tính</span><span>{formatVND(b.subtotal)}</span></div>
              {b.manualDiscount > 0 && (
                <div className="flex justify-between text-danger">
                  <span className="flex items-center gap-1"><Percent className="h-3 w-3" /> Chiết khấu thủ công</span>
                  <span>-{formatVND(b.manualDiscount)}</span>
                </div>
              )}
              {b.promoDiscount > 0 && (
                <div className="flex justify-between text-danger">
                  <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Khuyến mãi{b.promoName ? ` (${b.promoName})` : ""}</span>
                  <span>-{formatVND(b.promoDiscount)}</span>
                </div>
              )}
              {voucherDiscount > 0 && (
                <div className="flex justify-between text-danger">
                  <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Voucher{b.voucherName ? ` (${b.voucherName})` : ""}</span>
                  <span>-{formatVND(voucherDiscount)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-danger" data-testid="invoice-loyalty-discount">
                  <span className="flex items-center gap-1">Đổi điểm ({loyaltyRedeemedPoints} điểm)</span>
                  <span>-{formatVND(loyaltyDiscount)}</span>
                </div>
              )}
              {(b.shippingFee > 0 || b.shippingDiscount > 0) && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Truck className="h-3 w-3" /> Phí ship</span>
                    <span>{formatVND(b.shippingFee)}</span>
                  </div>
                  {b.shippingDiscount > 0 && (
                    <div className="flex justify-between text-success">
                      <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Ưu đãi ship</span>
                      <span>-{formatVND(b.shippingDiscount)}</span>
                    </div>
                  )}
                </>
              )}
              {b.vatAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT ({b.vatPercent}%)</span>
                  <span>+{formatVND(b.vatAmount)}</span>
                </div>
              )}
              <div className="border-t pt-1.5 flex justify-between font-bold text-base">
                <span>Tổng cộng</span>
                <span className="text-primary">{formatVND(b.total)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 border-t flex flex-wrap gap-2">
            <button onClick={onClose} className="flex-1 min-w-[80px] px-3 py-2 text-sm border rounded-md hover:bg-muted">Đóng</button>
            <button onClick={handlePrint58} className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
              <Printer className="h-4 w-4" /> In POS58
            </button>
          </div>
        </div>
      </div>

      <Printable58Invoice invoice={invoice} lines={lines} />
    </>
  );
}
