import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatVND } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { QuantityStepper } from "@/components/shared/QuantityStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  ShoppingCart,
  Trash2,
  ArrowRight,
  Package,
  AlertTriangle,
  ShieldCheck,
  Truck,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { useCart, cartActions, type CartItem } from "@/lib/cart";
import { promotions } from "@/services";
import type { CartContext, EvaluatedPromotion } from "@/services/types";

export default function CartPage() {
  const items = useCart();

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.lineSubtotal, 0),
    [items],
  );

  // Evaluate ALL promotions so users can pick the one they want instead of being
  // locked into the auto-best. Voucher discounts apply later on Checkout.
  const [allPromos, setAllPromos] = useState<EvaluatedPromotion[]>([]);
  const [chosenPromoId, setChosenPromoId] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    if (!items.length) {
      setAllPromos([]);
      return;
    }
    const ctx: CartContext = { lines: items, subtotal };
    void promotions.evaluateAll(ctx).then((list) => {
      if (cancel) return;
      setAllPromos(list);
    });
    return () => {
      cancel = true;
    };
  }, [items, subtotal]);

  const eligiblePromos = useMemo(() => allPromos.filter((p) => p.eligible), [allPromos]);
  // Default to the first eligible (best by value — adapter sorts) if user hasn't picked.
  const sortedEligible = useMemo(
    () => [...eligiblePromos].sort(
      (a, b) =>
        b.discountAmount + b.shippingDiscountAmount -
        (a.discountAmount + a.shippingDiscountAmount),
    ),
    [eligiblePromos],
  );
  const bestPromo: EvaluatedPromotion | null = useMemo(() => {
    if (chosenPromoId) {
      return sortedEligible.find((p) => p.promotionId === chosenPromoId) ?? sortedEligible[0] ?? null;
    }
    return sortedEligible[0] ?? null;
  }, [sortedEligible, chosenPromoId]);

  const promoDiscount = bestPromo?.discountAmount ?? 0;
  const baseShipping = subtotal >= 200000 ? 0 : 20000;
  const promoShipFree = bestPromo?.type === "free_shipping";
  const shippingFee = promoShipFree ? 0 : baseShipping;
  const total = Math.max(0, subtotal - promoDiscount + shippingFee);
  const hasStockIssue = items.some((i) => i.qty > i.stock);
  const freeShippingGap = Math.max(0, 200000 - subtotal);

  const removeItem = (id: string, name: string) => {
    cartActions.remove(id);
    toast.success(`Đã xóa ${name}`);
  };

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <EmptyState
          icon={ShoppingCart}
          title="Giỏ hàng đang trống"
          description="Hãy khám phá hàng nghìn sản phẩm chất lượng tại NhaDanShop"
          action={
            <Link
              to="/products"
              className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary transition-colors"
            >
              Mua sắm ngay <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="bg-storefront-bg min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-5">
          <p className="sf-eyebrow">Giỏ hàng</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
            Giỏ của bạn ({items.length})
          </h1>
        </div>

        {/* Free shipping progress */}
        {freeShippingGap > 0 && !promoShipFree && (
          <div className="mb-5 p-3 rounded-xl bg-primary-soft border border-primary/20 flex items-center gap-3">
            <Truck className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs">
                Mua thêm <span className="font-bold text-primary">{formatVND(freeShippingGap)}</span> để được{" "}
                <span className="font-bold">miễn phí giao hàng</span>
              </p>
              <div className="mt-1.5 h-1.5 bg-card rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, (subtotal / 200000) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-3 lg:gap-6">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <CartRow key={item.id} item={item} onRemove={removeItem} />
            ))}

            {/* Promotion picker — let users override the auto-applied deal. */}
            {sortedEligible.length > 0 && (
              <div className="bg-success-soft/30 border border-success/30 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-success">
                  <Gift className="h-4 w-4" /> Khuyến mãi áp dụng được ({sortedEligible.length})
                </div>
                <p className="text-xs text-muted-foreground">
                  Hệ thống tự chọn ưu đãi có lợi nhất. Bạn có thể đổi sang khuyến mãi khác phù hợp hơn.
                </p>
                <div className="space-y-1.5">
                  {sortedEligible.map((p) => {
                    const selected = bestPromo?.promotionId === p.promotionId;
                    return (
                      <button
                        key={p.promotionId}
                        type="button"
                        onClick={() => setChosenPromoId(p.promotionId)}
                        className={`w-full text-left p-2.5 rounded-xl border-2 transition-all ${
                          selected ? "border-success bg-card" : "border-transparent bg-card/60 hover:border-success/40"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            selected ? "border-success bg-success" : "border-muted-foreground/40"
                          }`}>
                            {selected && <span className="h-1.5 w-1.5 rounded-full bg-card" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold truncate">{p.name}</p>
                              {p.discountAmount > 0 && (
                                <span className="text-xs font-bold text-success shrink-0">−{formatVND(p.discountAmount)}</span>
                              )}
                              {p.shippingDiscountAmount > 0 && p.discountAmount === 0 && (
                                <span className="text-xs font-bold text-success shrink-0">Free ship</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{p.ruleSummary}</p>
                            {p.giftLines.length > 0 && (
                              <p className="text-[11px] text-success mt-0.5">
                                🎁 {p.giftLines.map((g) => `${g.productName} ×${g.qty}`).join(", ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-storefront-surface rounded-2xl border p-4 sf-shadow text-xs text-muted-foreground">
              💡 Mã giảm giá (voucher) có thể nhập ở bước thanh toán.
            </div>
          </div>

          {/* Summary */}
          <div className="mt-5 lg:mt-0">
            <div className="bg-storefront-surface rounded-2xl border p-5 lg:sticky lg:top-20 sf-shadow">
              <h2 className="font-bold text-base mb-4">Tóm tắt đơn hàng</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tạm tính ({items.length} sản phẩm)</span>
                  <span className="font-semibold">{formatVND(subtotal)}</span>
                </div>
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Khuyến mãi {bestPromo ? `(${bestPromo.name})` : ""}</span>
                    <span className="font-semibold">−{formatVND(promoDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phí giao hàng (tạm tính)</span>
                  <span className="font-semibold">
                    {shippingFee === 0 ? <span className="text-success">Miễn phí</span> : formatVND(shippingFee)}
                  </span>
                </div>
                <div className="border-t pt-3 mt-3 flex justify-between items-baseline">
                  <span className="font-semibold">Tổng cộng</span>
                  <span className="font-bold text-foreground text-xl">{formatVND(total)}</span>
                </div>
              </div>

              {hasStockIssue && (
                <div className="mt-4 p-3 bg-danger-soft rounded-xl text-xs text-danger flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Một số sản phẩm vượt quá tồn kho. Vui lòng điều chỉnh để tiếp tục.</span>
                </div>
              )}

              <Link
                to={hasStockIssue ? "#" : "/checkout"}
                onClick={(e) => hasStockIssue && e.preventDefault()}
                className={`mt-5 w-full flex items-center justify-center gap-2 h-12 rounded-full text-sm font-semibold transition-all ${
                  hasStockIssue
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-storefront-accent text-white hover:opacity-90 sf-shadow-cta"
                }`}
              >
                Tiến hành thanh toán <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                to="/products"
                className="mt-2 w-full flex items-center justify-center text-xs text-muted-foreground hover:text-foreground py-2"
              >
                ← Tiếp tục mua sắm
              </Link>

              <div className="mt-4 pt-4 border-t flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Thanh toán bảo mật · Đổi trả 7 ngày
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartRow({ item, onRemove }: { item: CartItem; onRemove: (id: string, name: string) => void }) {
  const overStock = item.qty > item.stock;
  const lowStock = item.stock <= 5;
  return (
    <div
      className={`bg-storefront-surface rounded-2xl border p-4 flex gap-3.5 sf-shadow ${
        overStock ? "border-danger/50" : ""
      }`}
    >
      <div className="h-20 w-20 bg-gradient-to-br from-muted to-storefront-soft rounded-xl flex items-center justify-center shrink-0">
        <Package className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight">{item.productName}</h3>
            {item.variantName && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.variantName}</p>
            )}
            <p className="text-sm font-bold text-foreground mt-1">{formatVND(item.unitPrice)}</p>
          </div>
          <button
            onClick={() => onRemove(item.id, item.productName)}
            className="text-muted-foreground hover:text-danger shrink-0 p-1 -m-1"
            aria-label="Xóa"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {overStock && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-danger">
            <AlertTriangle className="h-3 w-3" />
            Chỉ còn {item.stock} sản phẩm trong kho
          </div>
        )}
        {!overStock && lowStock && (
          <div className="mt-1.5">
            <StatusBadge status="low-stock" label={`Còn ${item.stock}`} />
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <QuantityStepper
            value={item.qty}
            onChange={(v) => cartActions.setQty(item.id, v)}
            max={item.stock}
            size="sm"
          />
          <p className="font-bold text-base text-foreground">{formatVND(item.lineSubtotal)}</p>
        </div>
      </div>
    </div>
  );
}
