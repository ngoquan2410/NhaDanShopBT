import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  useCart,
  useSelectedPromotionId,
  useSelectedPromotionMode,
  cartActions,
  getCartStepperMax,
  getCartQuantityCap,
  hasKnownCartStock,
  CART_QTY_ADJUSTED_SESSION_KEY,
  type CartItem,
} from "@/lib/cart";
import { storefrontAvailabilityUi, storefrontVariantFromCartItem } from "@/lib/storefrontAvailability";
import { cn } from "@/lib/utils";
import { promotions } from "@/services";
import type { CartContext, EvaluatedPromotion } from "@/services/types";
import { fetchPublicVariantAvailability, type StorefrontVariant } from "@/services/catalog/publicCatalog";
import { PROMOTION_TYPE_LABEL, parseProgressFromReason } from "@/components/promotions/PromotionLabels";

const PROGRESS_BASIS_LABEL: Record<string, string> = {
  ELIGIBLE_ITEMS: "Tính theo hàng trong phạm vi khuyến mãi",
  WHOLE_ORDER: "Tính theo toàn bộ đơn hàng",
  ITEM_QUANTITY: "Tính theo số lượng sản phẩm",
  SHIPPING_ADDRESS: "Cần địa chỉ giao hàng",
};

function isGiftPromotionType(type: string | null | undefined): boolean {
  const normalized = String(type ?? "").trim().toLowerCase();
  return normalized === "buy_x_get_y" || normalized === "gift" || normalized === "quantity_gift";
}

export default function CartPage() {
  const items = useCart();
  const persistedPromoId = useSelectedPromotionId();
  const persistedPromoMode = useSelectedPromotionMode();
  const availabilityReconciledKeyRef = useRef<string | null>(null);

  const variantIdsKey = useMemo(
    () => [...new Set(items.map((i) => i.variantId))].sort().join(","),
    [items],
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.lineSubtotal, 0),
    [items],
  );

  // Evaluate ALL promotions so users can pick the one they want instead of being
  // locked into the auto-best. Voucher discounts apply later on Checkout.
  const [allPromos, setAllPromos] = useState<EvaluatedPromotion[]>([]);
  const [promotionEvaluationStatus, setPromotionEvaluationStatus] = useState<"idle" | "loading" | "loaded">("idle");
  useEffect(() => {
    let cancel = false;
    if (!items.length) {
      setAllPromos([]);
      setPromotionEvaluationStatus("idle");
      return;
    }
    setAllPromos([]);
    setPromotionEvaluationStatus("loading");
    const ctx: CartContext = { lines: items, subtotal };
    void promotions.evaluateAll(ctx).then((list) => {
      if (cancel) return;
      setAllPromos(list);
      setPromotionEvaluationStatus("loaded");
    });
    return () => {
      cancel = true;
    };
  }, [items, subtotal]);

  const pendingAddressFreeShippingPromos = useMemo(
    () =>
      allPromos.filter((p) =>
        String(p.type).toLowerCase().replace(/-/g, "_") === "free_shipping" &&
        !p.eligible &&
        (
          p.progress?.basis === "SHIPPING_ADDRESS" ||
          /địa chỉ|shipping/i.test(p.reasonIfIneligible ?? "")
        )),
    [allPromos],
  );
  const selectablePromos = useMemo(
    () => allPromos.filter((p) => p.eligible).concat(
      pendingAddressFreeShippingPromos.filter((p) => !allPromos.some((x) => x.promotionId === p.promotionId && x.eligible)),
    ),
    [allPromos, pendingAddressFreeShippingPromos],
  );
  // Default to the first eligible (best by value — adapter sorts) if user hasn't picked.
  const sortedEligible = useMemo(
    () => [...selectablePromos].sort(
      (a, b) =>
        b.discountAmount + b.shippingDiscountAmount -
        (a.discountAmount + a.shippingDiscountAmount),
    ),
    [selectablePromos],
  );
  const selectedPromoCandidate: EvaluatedPromotion | null = useMemo(() => {
    if (persistedPromoId != null) {
      return allPromos.find((p) => p.promotionId === persistedPromoId) ?? null;
    }
    return null;
  }, [persistedPromoId, allPromos]);
  const autoPromo: EvaluatedPromotion | null = useMemo(() => sortedEligible[0] ?? null, [sortedEligible]);
  const appliedPromo: EvaluatedPromotion | null = useMemo(() => {
    if (selectedPromoCandidate?.eligible) {
      return selectedPromoCandidate;
    }
    return autoPromo;
  }, [selectedPromoCandidate, autoPromo]);

  useEffect(() => {
    if (promotionEvaluationStatus !== "loaded") return;
    if (!persistedPromoId) return;
    const exists = allPromos.some((p) => p.promotionId === persistedPromoId);
    if (!exists) {
      cartActions.clearSelectedPromotion("auto");
    }
  }, [promotionEvaluationStatus, persistedPromoId, allPromos]);

  useEffect(() => {
    try {
      if (window.sessionStorage?.getItem(CART_QTY_ADJUSTED_SESSION_KEY) === "1") {
        window.sessionStorage.removeItem(CART_QTY_ADJUSTED_SESSION_KEY);
        toast.info("Số lượng đã được điều chỉnh theo tồn kho hiện tại.");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!variantIdsKey) {
      availabilityReconciledKeyRef.current = null;
      return;
    }
    if (availabilityReconciledKeyRef.current === variantIdsKey) return;
    let cancel = false;
    void (async () => {
      try {
        const ids = variantIdsKey.split(",").filter(Boolean);
        const rows = await fetchPublicVariantAvailability(ids);
        if (cancel) return;
        const clamped = cartActions.mergePublicAvailabilityFromBatch(rows);
        if (clamped) {
          toast.info("Số lượng đã được điều chỉnh theo tồn kho hiện tại.");
        }
      } catch {
        /* quote/checkout vẫn là chốt chặn; không crash cart */
      } finally {
        if (!cancel) {
          availabilityReconciledKeyRef.current = variantIdsKey;
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [variantIdsKey]);

  const promoDiscount = appliedPromo?.type !== "free_shipping" ? (appliedPromo?.discountAmount ?? 0) : 0;
  const promoGiftLines = appliedPromo?.giftLines ?? [];
  const promoIsGift = isGiftPromotionType(appliedPromo?.type);
  const promoShipFree = appliedPromo?.type === "free_shipping";
  const total = Math.max(0, subtotal - promoDiscount);
  const hasStockIssue = items.some((i) => {
    const cap = getCartQuantityCap(i);
    return cap !== Number.MAX_SAFE_INTEGER && i.qty > cap;
  });
  const hasInvalidBackendLine = items.some((i) => i.catalogSource !== "backend" || i.schemaVersion !== 2 || !/^\d+$/.test(String(i.productId)) || !/^\d+$/.test(String(i.variantId)));
  const ineligiblePromos = useMemo(
    () => allPromos.filter((p) => !p.eligible && p.reasonIfIneligible && !pendingAddressFreeShippingPromos.some((x) => x.promotionId === p.promotionId)),
    [allPromos, pendingAddressFreeShippingPromos],
  );

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

        {/* Free-shipping banners are intentionally not hardcoded.
            Eligibility/progress comes from backend evaluation in `allPromos`. */}

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
                    const selected = appliedPromo?.promotionId === p.promotionId;
                    return (
                      <button
                        key={p.promotionId}
                        type="button"
                        data-testid={`cart-promo-option-${p.promotionId}`}
                        onClick={() => cartActions.setSelectedPromotion(p.promotionId, "manual")}
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
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 mr-1 rounded bg-muted text-foreground/70 text-[10px] font-semibold">
                                {PROMOTION_TYPE_LABEL[p.type]}
                              </span>
                              {p.ruleSummary}
                            </p>
                            {p.type === "free_shipping" && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Phí ship cuối cùng được xác nhận sau khi nhập địa chỉ giao hàng.
                              </p>
                            )}
                            {String(p.type).toLowerCase().replace(/-/g, "_") === "free_shipping" && !p.eligible && (
                              <span data-testid={`cart-promo-needs-address-${p.promotionId}`} className="inline-block mt-1 text-[10px] font-semibold rounded-full bg-warning-soft text-warning px-2 py-0.5">
                                Cần địa chỉ giao hàng
                              </span>
                            )}
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

            <div className="hidden" data-testid="cart-promo-selected-id">{persistedPromoId ?? ""}</div>
            <div className="hidden" data-testid="cart-promo-selected-mode">{persistedPromoMode}</div>
            <div className="hidden" data-testid="cart-promo-eval-status">{promotionEvaluationStatus}</div>
            {persistedPromoId && selectedPromoCandidate && !selectedPromoCandidate.eligible && (
              <div className="bg-warning-soft/40 border border-warning/40 rounded-2xl p-3 text-xs text-warning">
                <b>Khuyến mãi đã chọn hiện chưa đủ điều kiện.</b> {selectedPromoCandidate.reasonIfIneligible ?? "Vui lòng cập nhật giỏ hoặc địa chỉ giao hàng."}
              </div>
            )}


            {ineligiblePromos.length > 0 && (
              <div className="bg-storefront-surface border rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Truck className="h-4 w-4 text-muted-foreground" /> Sắp đạt khuyến mãi ({ineligiblePromos.length})
                </div>
                <ul className="space-y-3">
                  {ineligiblePromos.map((p) => {
                    const fallbackProgress = parseProgressFromReason(p.reasonIfIneligible, p.ruleSummary);
                    const basisLabel = p.progress?.basis ? (PROGRESS_BASIS_LABEL[p.progress.basis] ?? p.progress.basis) : undefined;
                    const progress =
                      p.progress != null
                        ? {
                            kind: p.progress.type === "multi_quantity" ? "qty" : "money",
                            current: p.progress.currentAmount,
                            target: p.progress.requiredAmount,
                            remaining: p.progress.remainingAmount,
                          }
                        : fallbackProgress;
                    let pct = 0;
                    if (progress.kind === "money" && progress.target && progress.target > 0) {
                      const cur = progress.current ?? Math.max(0, progress.target - (progress.remaining ?? progress.target));
                      pct = Math.min(100, Math.round((cur / progress.target) * 100));
                    } else if (progress.kind === "qty" && progress.target && progress.target > 0) {
                      const cur = progress.current ?? Math.max(0, progress.target - (progress.remaining ?? progress.target));
                      pct = Math.min(100, Math.round((cur / progress.target) * 100));
                    }
                    return (
                      <li key={p.promotionId} className="space-y-1.5" data-testid={`cart-promo-near-miss-${p.promotionId}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{p.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              <span className="inline-block px-1.5 py-0.5 mr-1 rounded bg-muted text-foreground/70 text-[10px] font-semibold">
                                {PROMOTION_TYPE_LABEL[p.type]}
                              </span>
                              {p.ruleSummary}
                            </p>
                          </div>
                          {p.type === "free_shipping" && (
                            <span data-testid={`cart-promo-needs-address-${p.promotionId}`} className="text-[10px] font-semibold rounded-full bg-warning-soft text-warning px-2 py-0.5 shrink-0">
                              Cần địa chỉ giao hàng
                            </span>
                          )}
                        </div>
                        {progress.kind !== "unknown" && (
                          <>
                            {basisLabel && (
                              <p className="text-[11px] text-muted-foreground">{basisLabel}</p>
                            )}
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-success transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {progress.kind === "money" ? (
                              <p className="text-[11px] text-muted-foreground">
                                {progress.target != null && progress.current != null ? (
                                  <>Đã đạt <b>{formatVND(progress.current)}</b> / {formatVND(progress.target)}. </>
                                ) : null}
                                {progress.remaining != null && progress.remaining > 0 ? (
                                  <>Còn thiếu <b>{formatVND(progress.remaining)}</b>.</>
                                ) : null}
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                Cần {progress.target ?? "?"}, đang có {progress.current ?? 0}
                                {progress.remaining != null && progress.remaining > 0 ? <>, còn thiếu <b>{progress.remaining}</b></> : null}
                              </p>
                            )}
                          </>
                        )}
                        {progress.kind === "unknown" && p.reasonIfIneligible && (
                          <p className="text-[11px] text-muted-foreground">{p.reasonIfIneligible}</p>
                        )}
                        {(p.type === "buy_x_get_y" || p.type === "gift" || p.type === "fixed_discount" || p.type === "percent_discount") && (
                          <p className="text-[10px] text-muted-foreground/80 italic">
                            Đơn tối thiểu có thể tính theo hàng trong phạm vi hoặc toàn bộ đơn, tùy cấu hình admin.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
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
                    <span>Khuyến mãi {appliedPromo ? `(${appliedPromo.name})` : ""}</span>
                    <span className="font-semibold">−{formatVND(promoDiscount)}</span>
                  </div>
                )}
                {promoIsGift && appliedPromo && (
                  <div data-testid="cart-summary-promotion-gifts" className="rounded-lg bg-success-soft/40 px-3 py-2 text-xs text-success space-y-0.5">
                    <p className="font-semibold">Quà tặng: {appliedPromo.name}</p>
                    {promoGiftLines.length > 0 ? (
                      promoGiftLines.map((g) => (
                        <p key={`${g.variantId ?? g.productId}`} data-testid={`cart-summary-promotion-gift-line-${g.variantId ?? g.productId}`}>
                          🎁 {g.productName} ×{g.qty}
                        </p>
                      ))
                    ) : (
                      <p data-testid="cart-summary-promotion-gifts-pending">Đang xác nhận quà tặng cho khuyến mãi này...</p>
                    )}
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Phí giao hàng</span>
                  <span className="font-semibold text-right text-muted-foreground">Tính ở bước thanh toán</span>
                </div>
                {promoShipFree && (
                  <p className="text-[11px] text-success">
                    Miễn phí ship sẽ được xác nhận sau khi nhập địa chỉ giao hàng.
                  </p>
                )}
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
              {hasInvalidBackendLine && (
                <div className="mt-4 p-3 bg-danger-soft rounded-xl text-xs text-danger flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Giỏ hàng có dữ liệu cũ/không thuộc backend catalog. Vui lòng xóa giỏ và thêm lại sản phẩm.</span>
                </div>
              )}

              <Link
                to={hasStockIssue || hasInvalidBackendLine ? "#" : "/checkout"}
                onClick={(e) => (hasStockIssue || hasInvalidBackendLine) && e.preventDefault()}
                className={`mt-5 w-full flex items-center justify-center gap-2 h-12 rounded-full text-sm font-semibold transition-all ${
                  hasStockIssue || hasInvalidBackendLine
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
  const cap = getCartQuantityCap(item);
  const finiteCap = cap !== Number.MAX_SAFE_INTEGER;
  const overStock = finiteCap && item.qty > cap;
  const variantForUi: StorefrontVariant =
    item.stockSource === "trusted" && item.availableQty === undefined && hasKnownCartStock(item)
      ? storefrontVariantFromCartItem({ ...item, availableQty: item.stock })
      : storefrontVariantFromCartItem(item);
  const availUi = storefrontAvailabilityUi(variantForUi);
  const showAvailLine =
    typeof item.availableQty === "number" || !!item.availabilityStatus || (item.stockSource === "trusted" && hasKnownCartStock(item));
  const lowTrusted = item.stockSource === "trusted" && hasKnownCartStock(item) && item.availableQty === undefined && item.stock <= 5;
  return (
    <div
      data-testid="storefront-cart-line"
      data-product-id={item.productId}
      data-variant-id={item.variantId}
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
            {typeof item.availableQty === "number"
              ? `Số lượng vượt quá tồn cho phép. Tối đa ${cap} ${item.sellUnit ?? "cái"}.`
              : `Chỉ còn ${item.stock} sản phẩm trong kho`}
          </div>
        )}
        {showAvailLine && (
          <p
            data-testid="storefront-cart-line-availability"
            className={cn("text-[11px] mt-1.5", availUi.textClassName)}
          >
            {availUi.text}
          </p>
        )}
        {!overStock && lowTrusted && (
          <div className="mt-1.5">
            <StatusBadge status="low-stock" label={`Còn ${item.stock}`} />
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <QuantityStepper
            value={item.qty}
            onChange={(v) => cartActions.setQty(item.id, v)}
            max={getCartStepperMax(item)}
            size="sm"
            inputTestId={`storefront-cart-line-qty-${item.productId}-${item.variantId}`}
            incrementTestId={`storefront-cart-line-qty-plus-${item.productId}-${item.variantId}`}
            decrementTestId={`storefront-cart-line-qty-minus-${item.productId}-${item.variantId}`}
          />
          <p className="font-bold text-base text-foreground">{formatVND(item.lineSubtotal)}</p>
        </div>
      </div>
    </div>
  );
}
