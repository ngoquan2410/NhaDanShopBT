import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { formatVND } from "@/lib/format";
import {
  CreditCard,
  Banknote,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Lock,
  Package,
  ShieldCheck,
  Check,
  Truck,
  AlertTriangle,
  Loader2,
  Tag,
  X,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { pendingOrders, promotions, shipping, postSalesQuote } from "@/services";
import type { SalesQuoteApiResult } from "@/services";
import type {
  CartContext,
  EvaluatedPromotion,
  GiftLine,
  PaymentMethod,
  ShippingAddress,
  ShippingQuote,
  PendingOrder,
  PricingBreakdownSnapshot,
} from "@/services/types";
import { useCart, useSelectedPromotionId, useSelectedPromotionMode, cartActions } from "@/lib/cart";
import { AddressSelect, type AddressSelectValue } from "@/components/shared/AddressSelect";
import { AddressAutocomplete, type GoongResolvedAddress, type FallbackReason, clearSessionFallback } from "@/components/shared/AddressAutocomplete";
import { useAuth } from "@/lib/admin-auth";
import { accountApi, type CustomerPointsSummary } from "@/services/account/accountApi";

const paymentMethods = [
  { id: "cash_on_delivery", label: "Tiền mặt khi nhận (COD)", icon: Banknote, desc: "Tạo đơn chờ — không lập hóa đơn cục bộ; admin xác nhận & xuất hóa đơn backend" },
  { id: "bank_transfer", label: "Chuyển khoản ngân hàng", icon: CreditCard, desc: "Tạo đơn chờ — admin xác nhận sau khi nhận tiền" },
  { id: "momo", label: "Ví MoMo", icon: Smartphone, desc: "Quét QR — admin xác nhận thanh toán" },
  { id: "zalopay", label: "ZaloPay", icon: Smartphone, desc: "Quét QR — admin xác nhận thanh toán" },
] as const;

type PaymentId = (typeof paymentMethods)[number]["id"];

const EMPTY_ADDR: AddressSelectValue = {
  provinceCode: "",
  provinceName: "",
  districtCode: "",
  districtName: "",
  wardCode: "",
  wardName: "",
};

type GiftSummaryLine = { key: string; label: string; qty: number };

export function isGiftPromotionType(type: string | null | undefined): boolean {
  const normalized = String(type ?? "").trim().toLowerCase();
  return normalized === "buy_x_get_y" || normalized === "quantity_gift" || normalized === "gift";
}

/** Cross-check {@link PricingBreakdownSnapshot#total} against net components from the same quote (VND integers). */
function recomputeQuoteTotalVnd(pb: PricingBreakdownSnapshot): number | null {
  const item = pb.itemNetRevenue;
  const ship = pb.shippingNetRevenue;
  if (item == null || ship == null) return null;
  return Math.round(item + ship + (pb.vatAmount ?? 0));
}

export function buildCheckoutGiftSummaryLines(
  serverOk: boolean,
  rewardLines: SalesQuoteApiResult["rewardLines"] | null | undefined,
  promotionSnapshotGiftLines:
    | Array<{
      productId?: string | number | null;
      variantId?: string | number | null;
      productName?: string | null;
      variantName?: string | null;
      qty?: number | null;
    }>
    | null
    | undefined,
  previewGiftLines: GiftLine[],
): GiftSummaryLine[] {
  if (serverOk && Array.isArray(rewardLines) && rewardLines.length > 0) {
    return rewardLines.map((r) => ({
      key: `${r.variantId ?? r.productId}`,
      label: `${r.productName}${r.variantName ? ` ${r.variantName}` : ""}`,
      qty: r.quantity,
    }));
  }
  if (serverOk && Array.isArray(promotionSnapshotGiftLines) && promotionSnapshotGiftLines.length > 0) {
    return promotionSnapshotGiftLines.map((g) => ({
      key: `${g.variantId ?? g.productId}`,
      label: `${g.productName ?? ""}${g.variantName ? ` ${g.variantName}` : ""}`.trim(),
      qty: Number(g.qty ?? 0),
    }));
  }
  return previewGiftLines.map((g) => ({
    key: `${g.variantId ?? g.productId}`,
    label: `${g.productName}${g.variantName ? ` ${g.variantName}` : ""}`,
    qty: g.qty,
  }));
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const cartItems = useCart();
  const selectedPromotionId = useSelectedPromotionId();
  const selectedPromotionMode = useSelectedPromotionMode();
  const auth = useAuth();
  const [accountPoints, setAccountPoints] = useState<CustomerPointsSummary | null>(null);
  const [recoverableOrders, setRecoverableOrders] = useState<PendingOrder[]>([]);
  const [payment, setPayment] = useState<PaymentId>("cash_on_delivery");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [note, setNote] = useState("");
  const [addr, setAddr] = useState<AddressSelectValue>(EMPTY_ADDR);
  const [prefilled, setPrefilled] = useState(false);
  const [acFallback, setAcFallback] = useState<FallbackReason | null>(null);
  const [mappingWarning, setMappingWarning] = useState<string | null>(null);
  const [unmatchedLevels, setUnmatchedLevels] = useState<Array<"province" | "district" | "ward">>([]);
  const [acRetryNonce, setAcRetryNonce] = useState(0);
  const [originalAddressInput, setOriginalAddressInput] = useState("");
  const [requestedRedeemPoints, setRequestedRedeemPoints] = useState(0);

  useEffect(() => {
    if (!auth.session) { setAccountPoints(null); setRecoverableOrders([]); return; }
    accountApi.points().then(setAccountPoints).catch(() => setAccountPoints(null));
    accountApi.pendingOrders().then(setRecoverableOrders).catch(() => setRecoverableOrders([]));
  }, [auth.session]);

  // One-shot pre-fill from the persistent customer profile.
  useEffect(() => {
    if (prefilled) return;
    if (!auth.session) return;
    accountApi.me().then((m) => {
      if (m.customerName && !name) setName(m.customerName);
      if (m.phone && !phone) setPhone(m.phone);
      setPrefilled(true);
    }).catch(() => setPrefilled(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.session]);

  // Voucher: code sent to backend quote — commercial amounts come from beQuote only.
  const [voucherInput, setVoucherInput] = useState("");
  const [appliedVoucherCode, setAppliedVoucherCode] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const subtotal = useMemo(
    () => cartItems.reduce((s, i) => s + i.lineSubtotal, 0),
    [cartItems],
  );

  const [quote, setQuote] = useState<ShippingQuote>({ status: "incomplete" });
  const [quoting, setQuoting] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [retryCooldown, setRetryCooldown] = useState(0);
  const [beQuote, setBeQuote] = useState<SalesQuoteApiResult | null>(null);
  const [beQuoteLoading, setBeQuoteLoading] = useState(false);
  const [beQuoteErr, setBeQuoteErr] = useState<string | null>(null);

  // Stable draft order code so admin GHN logs can be traced to this checkout
  // attempt even before the order is actually persisted.
  const [draftOrderCode] = useState(
    () => `DRAFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
  );

  // Build canonical ShippingAddress (or null if incomplete) and quote on change.
  const shippingAddress: ShippingAddress | null = useMemo(() => {
    if (!addr.provinceCode || !addr.districtCode || !addr.wardCode) return null;
    return {
      receiverName: name.trim(),
      phone: phone.trim(),
      provinceCode: addr.provinceCode,
      provinceName: addr.provinceName,
      districtCode: addr.districtCode,
      districtName: addr.districtName,
      wardCode: addr.wardCode,
      wardName: addr.wardName,
      street: street.trim(),
      rawAddress: originalAddressInput.trim() || undefined,
      note: note.trim() || undefined,
    };
  }, [addr, name, phone, street, note, originalAddressInput]);

  // 500ms debounce: rapid address changes (e.g. ward dropdown spam) collapse
  // into a single quote() call.
  useEffect(() => {
    let cancel = false;
    if (!shippingAddress) {
      setQuote({ status: "incomplete" });
      setQuoting(false);
      return;
    }
    setQuoting(true);
    const t = setTimeout(async () => {
      const result = await shipping.quote({
        address: shippingAddress,
        subtotal,
        orderCode: draftOrderCode,
      });
      if (!cancel) {
        setQuote(result);
        setQuoting(false);
      }
    }, 500);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [shippingAddress, subtotal, retryNonce, draftOrderCode]);

  // Cooldown ticker for the "Thử báo giá lại" button.
  useEffect(() => {
    if (retryCooldown <= 0) return;
    const t = setTimeout(() => setRetryCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [retryCooldown]);

  const handleRetryQuote = () => {
    if (retryCooldown > 0 || quoting) return;
    const s = shipping as { resetBreaker?: () => void };
    s.resetBreaker?.();
    setRetryNonce((n) => n + 1);
    setRetryCooldown(15);
  };

  const baseShippingFee = quote.status === "quoted" ? quote.fee ?? 0 : 0;

  // Promotion engine reads cart lines directly — they already carry the real
  // productId / variantId / categoryId from the shared cart store.
  const [bestPromo, setBestPromo] = useState<EvaluatedPromotion | null>(null);
  const [manualSelectedPromo, setManualSelectedPromo] = useState<EvaluatedPromotion | null>(null);
  const [promoFallbackNotice, setPromoFallbackNotice] = useState<string | null>(null);
  const [effectivePromotionIdForQuote, setEffectivePromotionIdForQuote] = useState<string | null>(null);
  const [effectivePromotionMode, setEffectivePromotionMode] = useState<"auto" | "manual">("auto");
  const [effectivePromotionResolving, setEffectivePromotionResolving] = useState(false);
  const [manualPromotionInvalidReason, setManualPromotionInvalidReason] = useState<string | null>(null);
  const promoResolveSeq = useRef(0);
  const quoteReqSeq = useRef(0);

  useEffect(() => {
    let cancel = false;
    const seq = ++promoResolveSeq.current;
    const ctx: CartContext = {
      lines: cartItems,
      subtotal,
      shippingAddress: shippingAddress ?? undefined,
      shippingQuote: quote,
      voucherCode: appliedVoucherCode ?? undefined,
    };
    if (!cartItems.length) {
      setBestPromo(null);
      setManualSelectedPromo(null);
      setEffectivePromotionIdForQuote(null);
      setEffectivePromotionMode("auto");
      setEffectivePromotionResolving(false);
      return;
    }
    if (selectedPromotionMode === "manual") {
      const manualId = selectedPromotionId ?? null;
      setEffectivePromotionIdForQuote(manualId);
      setEffectivePromotionMode("manual");
      if (!manualId) {
        setManualSelectedPromo(null);
        setEffectivePromotionResolving(false);
        return;
      }
      setEffectivePromotionResolving(true);
      void promotions.evaluateAll(ctx)
        .then((list) => {
          if (cancel || seq !== promoResolveSeq.current) return;
          const selected = list.find((p) => p.promotionId === manualId) ?? null;
          setManualSelectedPromo(selected);
          setEffectivePromotionResolving(false);
        })
        .catch(() => {
          if (cancel || seq !== promoResolveSeq.current) return;
          setManualSelectedPromo(null);
          setEffectivePromotionResolving(false);
        });
      return;
    }
    setManualSelectedPromo(null);
    setEffectivePromotionResolving(true);
    void promotions.pickBest(ctx)
      .then((picked) => {
        if (cancel || seq !== promoResolveSeq.current) return;
        setBestPromo(picked ?? null);
        setEffectivePromotionIdForQuote(picked?.promotionId ?? null);
        setEffectivePromotionMode("auto");
        setEffectivePromotionResolving(false);
        setPromoFallbackNotice(null);
      })
      .catch(() => {
        if (!cancel && seq === promoResolveSeq.current) {
          setBestPromo(null);
          setEffectivePromotionIdForQuote(null);
          setEffectivePromotionMode("auto");
          setEffectivePromotionResolving(false);
          setPromoFallbackNotice(null);
          toast.error("Không đánh giá được khuyến mãi");
        }
      });
    return () => {
      cancel = true;
    };
  }, [cartItems, subtotal, shippingAddress, quote, appliedVoucherCode, selectedPromotionId, selectedPromotionMode]);

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      setBeQuote(null);
      setBeQuoteLoading(false);
      return;
    }
    let cancel = false;
    if (!cartItems.length || quote.status !== "quoted" || !shippingAddress || effectivePromotionResolving) {
      setBeQuote(null);
      setBeQuoteErr(null);
      setBeQuoteLoading(false);
      setManualPromotionInvalidReason(null);
      return;
    }
    if (!shippingAddress.street || shippingAddress.street.trim().length === 0) {
      setBeQuote(null);
      setBeQuoteErr("Vui lòng nhập số nhà/tên đường.");
      setBeQuoteLoading(false);
      setManualPromotionInvalidReason(null);
      return;
    }
    setBeQuoteLoading(true);
    setBeQuoteErr(null);
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const lines = cartItems.map((it) => ({
            productId: Number(it.productId),
            variantId: Number(it.variantId),
            quantity: it.qty,
            discountPercent: 0,
            batchId: it.batchId != null ? Number(it.batchId) : undefined,
            rewardLine: false,
          }));
          if (lines.some((l) => Number.isNaN(l.productId) || Number.isNaN(l.variantId))) {
            if (!cancel) {
              setBeQuote(null);
              setBeQuoteLoading(false);
            }
            return;
          }
          const currentReqSeq = ++quoteReqSeq.current;
          const promotionId =
            effectivePromotionIdForQuote != null &&
            String(effectivePromotionIdForQuote).trim() !== "" &&
            !Number.isNaN(Number(effectivePromotionIdForQuote))
              ? Number(effectivePromotionIdForQuote)
              : undefined;
          const res = await postSalesQuote({
            source: "storefront",
            customerId: auth.session?.customerId ? String(auth.session.customerId) : undefined,
            lines,
            promotionId,
            voucherCode: appliedVoucherCode || undefined,
            shippingAddress,
            manualDiscount: 0,
            vatPercent: 0,
            requestedRedeemPoints: auth.session ? requestedRedeemPoints : 0,
          });
          if (!cancel && currentReqSeq === quoteReqSeq.current) {
            setBeQuote(res);
            setBeQuoteErr(null);
            setBeQuoteLoading(false);
            setManualPromotionInvalidReason(selectedPromotionMode === "manual" ? (res.selectedPromotionInvalidReason ?? null) : null);
            if (res.selectedPromotionInvalidReason) {
              toast.warning(res.selectedPromotionInvalidReason);
              if (selectedPromotionMode === "auto") {
                if (res.fallbackPromotionId != null && Number.isFinite(Number(res.fallbackPromotionId))) {
                  cartActions.setSelectedPromotion(String(res.fallbackPromotionId), "auto");
                } else {
                  cartActions.setSelectedPromotion(null, "auto");
                }
              } else {
                setPromoFallbackNotice("Khuyến mãi bạn chọn không còn hợp lệ. Vui lòng đổi khuyến mãi khác.");
              }
            }
          }
        } catch (e) {
          if (!cancel) {
            setBeQuote(null);
            setBeQuoteErr(e instanceof Error ? e.message : "Không lấy được báo giá máy chủ");
            setBeQuoteLoading(false);
          }
        }
      })();
    }, 500);
    return () => {
      cancel = true;
      window.clearTimeout(handle);
    };
  }, [
    appliedVoucherCode,
    cartItems,
    quote.status,
    shippingAddress,
    selectedPromotionId,
    selectedPromotionMode,
    effectivePromotionIdForQuote,
    effectivePromotionResolving,
    requestedRedeemPoints,
    auth.session,
  ]);

  const effectivePreviewPromo =
    selectedPromotionMode === "manual"
      ? manualSelectedPromo
      : bestPromo;
  const appliedPreviewPromo = effectivePreviewPromo?.eligible ? effectivePreviewPromo : null;
  const previewPromoIsFreeShipping = appliedPreviewPromo?.type === "free_shipping";
  const promoDiscountPreview =
    previewPromoIsFreeShipping
      ? 0
      : (appliedPreviewPromo?.discountAmount ?? 0);
  const promoShippingDiscountPreview =
    previewPromoIsFreeShipping && quote.status === "quoted"
      ? Math.min(appliedPreviewPromo?.shippingDiscountAmount ?? 0, baseShippingFee)
      : 0;
  const shippingFeePreview = Math.max(0, baseShippingFee - promoShippingDiscountPreview);
  const totalPreview = Math.max(0, subtotal - promoDiscountPreview + shippingFeePreview);

  const serverOk = !!beQuote && !beQuoteErr;
  const pb = serverOk ? beQuote.pricingBreakdownSnapshot : null;
  const vs = serverOk ? beQuote.voucherSnapshot : null;

  const rowSubtotal = pb ? pb.subtotal : subtotal;
  const rowPromoDisc = pb ? pb.promotionDiscount : promoDiscountPreview;
  const rowVoucherDisc = pb ? pb.voucherDiscount : 0;
  const rowLoyaltyDisc = pb ? pb.loyaltyDiscount ?? 0 : 0;
  const rowShipFee = pb ? pb.shippingFee : shippingFeePreview;
  const rowShipDisc = pb ? pb.shippingDiscount : promoShippingDiscountPreview;
  const rowShipPayable = Math.max(0, rowShipFee - rowShipDisc);
  const displayTotal = pb ? pb.total : totalPreview;
  const recomputedQuoteTotal = serverOk && pb ? recomputeQuoteTotalVnd(pb) : null;
  const quoteTotalMismatch =
    serverOk && pb && recomputedQuoteTotal != null && Math.abs(recomputedQuoteTotal - pb.total) > 1;
  const voucherIsShipOnly = Boolean(serverOk && vs && vs.freeShipping);
  const showVoucherMerchandiseRow = Boolean(
    serverOk && vs && !voucherIsShipOnly && rowVoucherDisc > 0,
  );
  const previewPromotionLabel =
    appliedPreviewPromo?.name ?? null;
  const quotedPromotionLabel =
    beQuote?.effectivePromotionName
    ?? null;
  const previewGiftLines = appliedPreviewPromo?.giftLines ?? [];
  const giftSummaryLines = buildCheckoutGiftSummaryLines(
    serverOk,
    beQuote?.rewardLines,
    beQuote?.promotionSnapshot?.giftLines,
    previewGiftLines,
  );
  const effectiveGiftType = serverOk
    ? (beQuote?.effectivePromotionType ?? beQuote?.promotionSnapshot?.type ?? null)
    : (appliedPreviewPromo?.type ?? null);
  const shouldShowGiftSummary = isGiftPromotionType(effectiveGiftType);

  const phoneOk = /^[\d+]{9,12}$/.test(phone.replace(/\s/g, ""));
  const streetMissing = street.trim().length === 0;
  // Block submit if GHN couldn't map the ward — the address is ambiguous and
  // the local zone fallback may underprice it. User must pick a different ward.
  const addressUnmapped = quote.usedFallback && quote.fallbackReason === "address_unmapped";
  const canSubmit =
    cartItems.length > 0 &&
    cartItems.every((i) => i.catalogSource === "backend" && i.schemaVersion === 2 && /^\d+$/.test(String(i.productId)) && /^\d+$/.test(String(i.variantId))) &&
    name.trim().length > 0 &&
    phoneOk &&
    !streetMissing &&
    quote.status === "quoted" &&
    !addressUnmapped &&
    !submitting &&
    !!beQuote &&
    !beQuoteLoading &&
    !beQuoteErr &&
    !manualPromotionInvalidReason &&
    (!appliedVoucherCode || (vs != null && vs.code.toLowerCase() === appliedVoucherCode.toLowerCase()))
    && !quoteTotalMismatch;

  const applyVoucher = () => {
    const code = voucherInput.trim();
    if (!code) {
      setVoucherError("Vui lòng nhập mã giảm giá");
      return;
    }
    setVoucherError(null);
    setAppliedVoucherCode(code);
    setVoucherInput("");
    toast.success(`Đã gửi mã ${code} — đang lấy báo giá máy chủ…`);
  };

  const removeVoucher = () => {
    setAppliedVoucherCode(null);
    setVoucherError(null);
  };

  const submit = async () => {
    if (!name.trim() || !phoneOk) {
      toast.error("Vui lòng nhập đầy đủ họ tên và SĐT hợp lệ");
      return;
    }
    if (streetMissing) {
      toast.error("Vui lòng nhập số nhà/tên đường.");
      return;
    }
    if (beQuoteErr && appliedVoucherCode) {
      toast.error(beQuoteErr);
      return;
    }
    if (quote.status !== "quoted" || !shippingAddress) {
      toast.error("Vui lòng nhập đầy đủ địa chỉ để tính phí giao hàng");
      return;
    }
    if (!beQuote || beQuoteErr) {
      toast.error("Chưa có báo giá máy chủ hợp lệ — không thể tạo đơn");
      return;
    }
    setSubmitting(true);
    try {
      const order = await pendingOrders.create({
        customerId: auth.session?.customerId ? String(auth.session.customerId) : undefined,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        shippingAddress,
        paymentMethod: payment as PaymentMethod,
        quotePublicId: beQuote.quoteId,
        shippingQuoteSnapshot: beQuote.shippingQuoteSnapshot ?? undefined,
        pricingBreakdownSnapshot: beQuote.pricingBreakdownSnapshot,
        note: note.trim() || undefined,
      });
      cartActions.clear();
      toast.success("Đã tạo đơn — chuyển sang trang chờ thanh toán");
      navigate(`/pending-payment/${order.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được đơn — kiểm tra báo giá, tồn kho, hoặc đăng nhập.");
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    const latestRecoverable = recoverableOrders[0];
    if (latestRecoverable) {
      const restoreForEdit = async () => {
        cartActions.replace(latestRecoverable.lines.filter((line) => !line.rewardLine).map((line) => ({
          id: line.id,
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName,
          variantName: line.variantName,
          qty: line.qty,
          unitPrice: line.unitPrice,
          lineSubtotal: line.lineSubtotal,
          batchId: line.batchId,
          stock: Number.MAX_SAFE_INTEGER,
          catalogSource: "backend",
          schemaVersion: 2,
        })));
        try {
          await accountApi.cancelPendingOrderForEdit(latestRecoverable.id);
          toast.success("Đã đưa sản phẩm về giỏ để chỉnh sửa đơn");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Không hủy được đơn chờ cũ");
        }
      };
      return (
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <Clock className="h-12 w-12 text-warning mx-auto mb-3" />
          <h1 className="text-lg font-bold">Bạn có đơn chờ thanh toán</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Đơn {latestRecoverable.code} vẫn đang được giữ. Bạn có thể thanh toán tiếp hoặc sửa lại đơn.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link to={`/pending-payment/${latestRecoverable.id}`} className="inline-flex items-center justify-center gap-2 h-10 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              Thanh toán tiếp
            </Link>
            <button type="button" onClick={() => void restoreForEdit()} className="inline-flex items-center justify-center gap-2 h-10 rounded-full border text-sm font-semibold hover:bg-muted">
              Sửa đơn
            </button>
          </div>
          <Link to="/products" className="mt-3 inline-flex items-center justify-center text-xs text-muted-foreground hover:text-foreground">
            Tiếp tục mua sắm
          </Link>
        </div>
      );
    }
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <Package className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
        <h1 className="text-lg font-bold">Giỏ hàng đang trống</h1>
        <p className="text-sm text-muted-foreground mt-1">Thêm sản phẩm vào giỏ trước khi thanh toán.</p>
        <Link to="/products" className="mt-4 inline-flex items-center gap-2 bg-foreground text-background px-5 py-2.5 rounded-full text-sm font-semibold">
          Mua sắm ngay
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-storefront-bg min-h-screen pb-24 lg:pb-10">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <p className="sf-eyebrow">Thanh toán</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Hoàn tất đơn hàng</h1>
        </div>

        <div className="lg:grid lg:grid-cols-5 lg:gap-6">
          <div className="lg:col-span-3 space-y-5">
            {/* Customer + address */}
            <section className="bg-storefront-surface rounded-2xl border p-5 sf-shadow">
              <h2 className="font-bold text-base mb-4">Thông tin giao hàng</h2>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="Họ và tên *" value={name} onChange={setName} placeholder="Nguyễn Văn A" />
                <Field label="Số điện thoại *" value={phone} onChange={setPhone} placeholder="0901234567" />
              </div>
              <div className="mt-3.5">
                {acFallback && (
                  <div className="mb-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-2.5 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-warning-foreground">
                        {acFallback === "quota_exceeded"
                          ? "Đã đạt giới hạn gợi ý địa chỉ trong ngày — vui lòng nhập thủ công bên dưới."
                          : acFallback === "provider_disabled"
                            ? "Gợi ý địa chỉ tạm không dùng được (chưa cấu hình Goong trên máy chủ) — vui lòng nhập thủ công bên dưới."
                            : "Không kết nối được dịch vụ gợi ý địa chỉ — vui lòng nhập thủ công bên dưới."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          clearSessionFallback();
                          setAcFallback(null);
                          setAcRetryNonce((n) => n + 1);
                        }}
                        className="mt-1 text-[11px] font-semibold text-warning-foreground underline underline-offset-2 hover:opacity-80"
                      >
                        Thử lại gợi ý địa chỉ
                      </button>
                    </div>
                  </div>
                )}
                <AddressAutocomplete
                  key={acRetryNonce}
                  onFallback={(reason) => setAcFallback(reason)}
                  onInputChange={(raw) => setOriginalAddressInput(raw)}
                  onResolved={(r: GoongResolvedAddress) => {
                    const levels = r.unmatched ?? [];
                    setUnmatchedLevels(levels);
                    if (levels.length > 0) {
                      const labels: Record<string, string> = {
                        province: "Tỉnh/Thành phố",
                        district: "Quận/Huyện",
                        ward: "Phường/Xã",
                      };
                      setMappingWarning(
                        `Không xác định chắc chắn ${levels.map((k) => labels[k]).join(", ")}. Vui lòng kiểm tra lại bên dưới.`,
                      );
                    } else {
                      setMappingWarning(null);
                    }

                    // User just deliberately picked an autocomplete suggestion —
                    // treat it as the source of truth and overwrite any prior
                    // (prefilled or stale) values so dropdowns reflect the choice.
                    if (r.provinceCode || r.districtCode || r.wardCode) {
                      setAddr({
                        provinceCode: r.provinceCode ?? "",
                        provinceName: r.provinceName ?? "",
                        districtCode: r.districtCode ?? "",
                        districtName: r.districtName ?? "",
                        wardCode: r.wardCode ?? "",
                        wardName: r.wardName ?? "",
                      });
                    }
                    if (r.street) setStreet(r.street);
                    if (r.formattedAddress) setOriginalAddressInput(r.formattedAddress);
                  }}
                />
                {mappingWarning && (
                  <div className="mt-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-2.5 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning-foreground">{mappingWarning}</p>
                  </div>
                )}
                {originalAddressInput.trim().length > 0 && (
                  <div className="mt-2 rounded-xl border bg-muted/40 p-2.5">
                    <p className="text-[11px] font-semibold text-muted-foreground">Địa chỉ gốc khách nhập</p>
                    <p className="mt-0.5 text-xs text-foreground break-words">{originalAddressInput}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Thông tin này giúp admin/shipper đối chiếu khi giao hàng.
                    </p>
                  </div>
                )}
              </div>
              <AddressSelect
                value={addr}
                onChange={(next) => {
                  setAddr(next);
                  // User just corrected a field manually → drop the warning for that level.
                  setUnmatchedLevels((lvls) => lvls.filter((l) => {
                    if (l === "province") return !next.provinceCode;
                    if (l === "district") return !next.districtCode;
                    if (l === "ward") return !next.wardCode;
                    return true;
                  }));
                }}
                errors={{
                  province: unmatchedLevels.includes("province") && !addr.provinceCode ? "Goong không khớp được Tỉnh/Thành phố — chọn lại giúp." : undefined,
                  district: unmatchedLevels.includes("district") && !addr.districtCode ? "Goong không khớp được Quận/Huyện — chọn lại giúp." : undefined,
                  ward: unmatchedLevels.includes("ward") && !addr.wardCode ? "Goong không khớp được Phường/Xã — chọn lại giúp." : undefined,
                }}
                className="mt-3.5"
              />
              {(!addr.provinceCode || !addr.districtCode || !addr.wardCode) && (
                <div className="mt-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-2.5 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] text-warning-foreground">
                    Vui lòng chọn đủ Tỉnh / Huyện / Xã để tính phí giao hàng.
                  </p>
                </div>
              )}
              <div className="mt-3.5">
                <Field label="Số nhà, đường" value={street} onChange={setStreet} placeholder="VD: Tên tiệm, số nhà, tên đường" />
                {streetMissing && (
                  <p className="mt-1 text-[11px] text-danger">Vui lòng nhập số nhà/tên đường.</p>
                )}
                {originalAddressInput.trim().length > 0 && street.trim().length > 0 && street.trim().length < 6 && (
                  <p className="mt-1 text-[11px] text-warning-foreground">
                    Kiểm tra lại Số nhà, đường để shipper tìm đúng địa chỉ.
                  </p>
                )}
              </div>
              <div className="mt-3.5">
                <label className="text-xs font-semibold text-muted-foreground">Ghi chú đơn hàng</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú thêm (tùy chọn)"
                  rows={2}
                  className="mt-1.5 w-full px-3.5 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none"
                />
              </div>

              <ShippingBlock quote={quote} loading={quoting} onRetry={handleRetryQuote} retryCooldown={retryCooldown} />
            </section>

            {/* Payment */}
            <section className="bg-storefront-surface rounded-2xl border p-5 sf-shadow">
              <h2 className="font-bold text-base mb-4">Phương thức thanh toán</h2>
              <div className="space-y-2.5">
                {paymentMethods.map((m) => {
                  const selected = payment === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPayment(m.id)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                        selected ? "border-foreground bg-foreground/[0.02] sf-shadow" : "border-border hover:border-foreground/30"
                      )}
                    >
                      <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", selected ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                        <m.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{m.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                      </div>
                      <div className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0", selected ? "border-foreground bg-foreground" : "border-border")}>
                        {selected && <Check className="h-3 w-3 text-background" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 p-3 bg-info-soft rounded-xl text-xs text-info flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Mọi phương thức tạo <b>đơn chờ</b> trước; hóa đơn backend chỉ khi admin xác nhận (COD gửi <code>cod</code> lên máy chủ).
                </span>
              </div>
            </section>
          </div>

          {/* Right — Order summary */}
          <div className="lg:col-span-2 mt-5 lg:mt-0">
            <div className="bg-storefront-surface rounded-2xl border p-5 lg:sticky lg:top-20 sf-shadow">
              <button className="flex items-center justify-between w-full lg:cursor-default" onClick={() => setSummaryOpen(!summaryOpen)}>
                <h2 className="font-bold text-base">Đơn hàng ({cartItems.length})</h2>
                <span className="lg:hidden">{summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
              </button>
              <div className={cn("mt-3.5 space-y-2.5", !summaryOpen && "hidden lg:block")}>
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-10 w-10 bg-gradient-to-br from-muted to-storefront-soft rounded-lg flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">
                          {item.productName}{item.variantName ? ` · ${item.variantName}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{item.qty} × {formatVND(item.unitPrice)}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold shrink-0">{formatVND(item.lineSubtotal)}</span>
                  </div>
                ))}
              </div>

              {/* Voucher input */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold">Mã giảm giá</p>
                </div>
                {appliedVoucherCode ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-success-soft/40 border border-success/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-success font-mono">{appliedVoucherCode}</p>
                      {vs?.ruleSummary ? (
                        <p className="text-[11px] text-muted-foreground truncate">{vs.ruleSummary}</p>
                      ) : null}
                      {beQuoteLoading ? <p className="text-[11px] text-muted-foreground">Đang xác nhận với máy chủ…</p> : null}
                      {beQuoteErr ? <p className="text-[11px] text-danger mt-0.5">{beQuoteErr}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={removeVoucher}
                      className="p-1 -m-1 text-muted-foreground hover:text-danger shrink-0"
                      aria-label="Bỏ mã"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        value={voucherInput}
                        onChange={(e) => { setVoucherInput(e.target.value); setVoucherError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyVoucher())}
                        placeholder="VD: NHADAN10"
                        className="flex-1 h-10 px-3.5 text-sm border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                      />
                      <button
                        type="button"
                        onClick={applyVoucher}
                        disabled={beQuoteLoading}
                        className="px-4 h-10 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-50"
                      >
                        Áp dụng
                      </button>
                    </div>
                    {voucherError && <p className="mt-1.5 text-[11px] text-danger">{voucherError}</p>}
                  </>
                )}
              </div>

              {auth.session && accountPoints && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-semibold">Đổi điểm</p>
                    <p className="text-[11px] text-muted-foreground">
                      Số dư {accountPoints.pointBalance} · đang giữ {accountPoints.pointReserved} · khả dụng {accountPoints.availablePoints}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={accountPoints.availablePoints}
                    value={requestedRedeemPoints}
                    onChange={(e) => setRequestedRedeemPoints(Math.max(0, Math.min(accountPoints.availablePoints, Number(e.target.value || 0))))}
                    className="w-full h-10 px-3.5 text-sm border rounded-full bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    placeholder="Nhập số điểm muốn đổi"
                  />
                </div>
              )}
              {!auth.session && (
                <div className="mt-4 pt-4 border-t text-[11px] text-muted-foreground">
                  Đăng nhập để xem và đổi điểm tích lũy. Khách vãng lai vẫn có thể thanh toán nhưng không thể đổi điểm.
                </div>
              )}

              <div className="border-t mt-4 pt-4 space-y-2 text-sm">
                <div data-testid="checkout-effective-promotion-id" className="hidden">{beQuote?.effectivePromotionId ?? effectivePromotionIdForQuote ?? ""}</div>
                <div data-testid="checkout-effective-promotion-name" className="hidden">{quotedPromotionLabel ?? previewPromotionLabel ?? ""}</div>
                <Row label="Tạm tính" value={formatVND(rowSubtotal)} dataTestId="checkout-subtotal" />
                {(previewPromotionLabel || quotedPromotionLabel) && rowPromoDisc > 0 && (
                  <Row
                    label={`Khuyến mãi sản phẩm: ${quotedPromotionLabel ?? previewPromotionLabel}`}
                    value={<span className="text-success">−{formatVND(rowPromoDisc)}</span>}
                    dataTestId="checkout-promotion-discount"
                  />
                )}
                {!serverOk && appliedPreviewPromo?.type === "free_shipping" && (
                  <p className="rounded-lg bg-info-soft px-3 py-2 text-[11px] text-info">
                    Miễn phí ship sẽ áp dụng sau khi nhập địa chỉ.
                  </p>
                )}
                {promoFallbackNotice && (
                  <p className="rounded-lg bg-warning-soft px-3 py-2 text-[11px] text-warning">
                    {promoFallbackNotice}
                  </p>
                )}
                {selectedPromotionMode === "manual" && selectedPromotionId && !previewPromotionLabel && (
                  <p className="rounded-lg bg-info-soft px-3 py-2 text-[11px] text-info">
                    Đang xác nhận khuyến mãi đã chọn...
                  </p>
                )}
                {manualPromotionInvalidReason && (
                  <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[11px] text-danger">
                    Khuyến mãi đã chọn không hợp lệ: {manualPromotionInvalidReason}
                  </p>
                )}
                {showVoucherMerchandiseRow && vs && (
                  <Row
                    label={`Mã giảm giá: ${vs.code}`}
                    value={<span className="text-success">−{formatVND(rowVoucherDisc)}</span>}
                    dataTestId="checkout-voucher-discount"
                  />
                )}
                {rowLoyaltyDisc > 0 && (
                  <Row
                    label={`Đổi điểm (${beQuote?.loyaltySnapshot?.redeemedPoints ?? pb?.loyaltyRedeemedPoints ?? 0} điểm)`}
                    value={<span className="text-success">−{formatVND(rowLoyaltyDisc)}</span>}
                    dataTestId="checkout-loyalty-discount"
                  />
                )}
                <Row
                  label="Phí giao hàng"
                  value={
                    quoting ? <span className="text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Đang tính…</span> :
                    quote.status === "incomplete" ? <span className="text-muted-foreground">—</span> :
                    quote.status === "unavailable" ? <span className="text-danger">Không khả dụng</span> :
                    quote.status === "quoted" ? formatVND(rowShipFee) : "—"
                  }
                  dataTestId="checkout-shipping-fee"
                />
                {rowShipDisc > 0 && (
                  <Row
                    label={
                      voucherIsShipOnly && vs
                        ? `Giảm phí giao hàng (voucher freeship ${vs.code})`
                        : "Giảm phí giao hàng"
                    }
                    value={<span className="text-success">−{formatVND(rowShipDisc)}</span>}
                    dataTestId={
                      voucherIsShipOnly ? "checkout-voucher-shipping-discount" : "checkout-shipping-discount"
                    }
                  />
                )}
                {serverOk && pb && pb.vatAmount > 0 && (
                  <Row label="VAT (máy chủ)" value={formatVND(pb.vatAmount)} />
                )}
                {beQuoteLoading && (
                  <div className="rounded-lg bg-info-soft px-3 py-2 text-[11px] text-info flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    <span>Đang xác nhận giá cuối cùng với máy chủ...</span>
                  </div>
                )}
                {beQuoteErr && !beQuoteLoading && (
                  <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[11px] text-danger flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <b>Báo giá máy chủ thất bại:</b> {beQuoteErr}. Vui lòng sửa địa chỉ / thử lại — không thể tạo đơn khi thiếu báo giá backend.
                    </span>
                  </div>
                )}
                {quoteTotalMismatch && !beQuoteLoading && (
                  <div
                    className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[11px] text-danger flex items-start gap-2"
                    data-testid="checkout-quote-total-mismatch"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <b>Tổng tiền báo giá không nhất quán:</b> không thể tạo đơn. Vui lòng làm mới hoặc chỉnh giỏ / địa chỉ rồi thử lại.
                    </span>
                  </div>
                )}
                {serverOk && (
                  <p className="text-[11px] text-muted-foreground">
                    Giá theo báo giá máy chủ (gồm voucher / KM / phí ship backend).
                  </p>
                )}
                {!previewPromoIsFreeShipping && shouldShowGiftSummary && (
                  <div data-testid="checkout-promotion-gifts" className="rounded-lg bg-success-soft/40 px-3 py-2 text-xs text-success space-y-0.5">
                    <p className="font-semibold">Quà tặng: {quotedPromotionLabel ?? previewPromotionLabel ?? "Khuyến mãi đã chọn"}</p>
                    {giftSummaryLines.length > 0 ? (
                      giftSummaryLines.map((g) => (
                        <p key={g.key} data-testid={`checkout-promotion-gift-line-${g.key}`}>🎁 {g.label} ×{g.qty}</p>
                      ))
                    ) : (
                      <p data-testid="checkout-promotion-gifts-pending">Đang xác nhận quà tặng cho khuyến mãi này...</p>
                    )}
                    {serverOk && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Quà tặng sẽ được xác nhận theo tồn kho tại thời điểm tạo đơn.
                      </p>
                    )}
                  </div>
                )}
                <div className="border-t pt-3 flex justify-between items-baseline">
                  <span className="font-bold">Tổng cộng</span>
                  <span className="font-bold text-foreground text-xl" data-testid="checkout-total">{formatVND(displayTotal)}</span>
                </div>
              </div>
              <button
                type="button"
                data-testid="checkout-create-pending"
                onClick={submit}
                disabled={!canSubmit}
                className={cn(
                  "mt-5 w-full flex items-center justify-center gap-2 h-12 rounded-full text-sm font-semibold transition-all",
                  canSubmit ? "bg-storefront-accent text-white hover:opacity-90 sf-shadow-cta" : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Tạo đơn chờ thanh toán
              </button>
              <div className="mt-4 pt-4 border-t flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Thông tin được mã hóa & bảo mật
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full h-11 px-3.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
      />
    </div>
  );
}

function Row({ label, value, dataTestId }: { label: string; value: React.ReactNode; dataTestId?: string }) {
  return (
    <div className="flex justify-between" data-testid={dataTestId}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function ShippingBlock({
  quote,
  loading,
  onRetry,
  retryCooldown,
}: {
  quote: ShippingQuote;
  loading: boolean;
  onRetry: () => void;
  retryCooldown: number;
}) {
  if (loading) {
    return (
      <div className="mt-4 p-3 rounded-xl bg-muted/50 text-xs flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tính phí giao hàng…
      </div>
    );
  }
  if (quote.status === "incomplete") {
    return (
      <div className="mt-4 p-3 rounded-xl bg-warning-soft text-xs text-warning flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Vui lòng chọn đầy đủ Tỉnh / Quận / Phường để tính phí giao hàng.</span>
      </div>
    );
  }
  if (quote.status === "unavailable") {
    return (
      <div className="mt-4 p-3 rounded-xl bg-danger-soft text-xs text-danger flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Không thể giao đến địa chỉ này: {quote.reasonIfUnavailable}</span>
      </div>
    );
  }
  if (quote.status === "quoted") {
    const eta = quote.etaDays;
    const attemptedTime = quote.attemptedAt
      ? new Date(quote.attemptedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
      : null;
    const cooldownLabel = retryCooldown > 0 ? `Thử lại sau ${retryCooldown}s` : "Thử báo giá lại";
    const retryDisabled = retryCooldown > 0 || loading;

    if (quote.usedFallback && quote.fallbackReason === "address_unmapped") {
      return (
        <div className="mt-4 p-3 rounded-xl bg-danger-soft text-xs text-danger space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Hệ thống không nhận diện được phường/xã này trên GHN. Vui lòng chọn lại phường/xã từ danh sách
              hoặc thử một phường lân cận để báo phí chính xác.
            </span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="ml-5 inline-flex items-center gap-1.5 px-3 h-7 rounded-full border border-danger/40 text-danger text-[11px] font-semibold hover:bg-danger/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 className={cn("h-3 w-3", loading && "animate-spin")} /> {cooldownLabel}
          </button>
        </div>
      );
    }

    if (quote.usedFallback) {
      return (
        <div className="mt-4 p-3 rounded-xl bg-warning-soft text-xs text-warning space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Không kết nối được dịch vụ GHN — đang dùng phí ước tính theo khu vực.
              Phí thực tế có thể thay đổi khi giao hàng.
              {eta ? <> Dự kiến <b>{eta.min}–{eta.max} ngày</b>. </> : null}
              {quote.fee === 0 ? <b>Miễn phí.</b> : <>Phí ước tính: <b>{formatVND(quote.fee ?? 0)}</b>.</>}
              {attemptedTime ? <span className="block mt-1 text-warning/70">Thử lúc {attemptedTime}.</span> : null}
            </span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="ml-5 inline-flex items-center gap-1.5 px-3 h-7 rounded-full border border-warning/40 text-warning text-[11px] font-semibold hover:bg-warning/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Loader2 className={cn("h-3 w-3", loading && "animate-spin")} /> {cooldownLabel}
          </button>
        </div>
      );
    }

    return (
      <div className="mt-4 p-3 rounded-xl bg-success-soft text-xs text-success flex items-start gap-2">
        <Truck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          {quote.zoneCode ? <>Khu vực <b>{quote.zoneCode}</b> · </> : null}
          {eta ? <>Dự kiến giao trong <b>{eta.min}–{eta.max} ngày</b> · </> : null}
          {quote.fee === 0 ? <b>Miễn phí giao hàng</b> : <>Phí: <b>{formatVND(quote.fee ?? 0)}</b></>}
        </span>
      </div>
    );
  }
  return null;
}
