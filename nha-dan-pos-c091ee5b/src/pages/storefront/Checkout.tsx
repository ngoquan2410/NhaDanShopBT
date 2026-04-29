import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { pendingOrders, promotions, shipping, postSalesQuote } from "@/services";
import type { SalesQuoteApiResult } from "@/services";
import type {
  CartContext,
  EvaluatedPromotion,
  PaymentMethod,
  ShippingAddress,
  ShippingQuote,
} from "@/services/types";
import { useCart, cartActions } from "@/lib/cart";
import { AddressSelect, type AddressSelectValue } from "@/components/shared/AddressSelect";
import { AddressAutocomplete, type GoongResolvedAddress, type FallbackReason, clearSessionFallback } from "@/components/shared/AddressAutocomplete";
import { currentCustomerActions, useCurrentCustomer } from "@/lib/current-customer";

const paymentMethods = [
  { id: "cash", label: "Tiền mặt khi nhận (COD)", icon: Banknote, desc: "Tạo đơn chờ — không lập hóa đơn cục bộ; admin xác nhận & xuất hóa đơn backend" },
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

export default function CheckoutPage() {
  const navigate = useNavigate();
  const cartItems = useCart();
  const { customer, defaultAddress } = useCurrentCustomer();
  const [payment, setPayment] = useState<PaymentId>("cash");
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

  // One-shot pre-fill from the persistent customer profile.
  useEffect(() => {
    if (prefilled) return;
    if (!customer && !defaultAddress) return;
    if (customer?.name && !name) setName(customer.name);
    if (customer?.phone && !phone) setPhone(customer.phone);
    if (defaultAddress) {
      setAddr({
        provinceCode: defaultAddress.provinceCode,
        provinceName: defaultAddress.provinceName,
        districtCode: defaultAddress.districtCode,
        districtName: defaultAddress.districtName,
        wardCode: defaultAddress.wardCode,
        wardName: defaultAddress.wardName,
      });
      if (defaultAddress.street && !street) setStreet(defaultAddress.street);
    }
    setPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, defaultAddress]);

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
      note: note.trim() || undefined,
    };
  }, [addr, name, phone, street, note]);

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

  useEffect(() => {
    let cancel = false;
    if (!cartItems.length) {
      setBestPromo(null);
      return;
    }
    const ctx: CartContext = {
      lines: cartItems,
      subtotal,
      shippingAddress: shippingAddress ?? undefined,
      shippingQuote: quote,
      voucherCode: appliedVoucherCode ?? undefined,
    };
    void promotions.pickBest(ctx)
      .then((p) => {
        if (!cancel) setBestPromo(p);
      })
      .catch(() => {
        if (!cancel) setBestPromo(null);
      });
    return () => {
      cancel = true;
    };
  }, [cartItems, subtotal, shippingAddress, quote, appliedVoucherCode]);

  useEffect(() => {
    if (import.meta.env.MODE === "test") {
      setBeQuote(null);
      setBeQuoteLoading(false);
      return;
    }
    let cancel = false;
    if (!cartItems.length || quote.status !== "quoted" || !shippingAddress) {
      setBeQuote(null);
      setBeQuoteErr(null);
      setBeQuoteLoading(false);
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
          const promotionId =
            bestPromo?.promotionId != null && !Number.isNaN(Number(bestPromo.promotionId))
              ? Number(bestPromo.promotionId)
              : undefined;
          const res = await postSalesQuote({
            source: "storefront",
            lines,
            promotionId,
            voucherCode: appliedVoucherCode || undefined,
            shippingAddress,
            manualDiscount: 0,
            vatPercent: 0,
          });
          if (!cancel) {
            setBeQuote(res);
            setBeQuoteErr(null);
            setBeQuoteLoading(false);
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
    bestPromo,
  ]);

  const promoDiscountPreview = bestPromo?.discountAmount ?? 0;
  const promoShippingDiscountPreview = Math.min(bestPromo?.shippingDiscountAmount ?? 0, baseShippingFee);
  const shippingFeePreview = Math.max(0, baseShippingFee - promoShippingDiscountPreview);
  const totalPreview = Math.max(0, subtotal - promoDiscountPreview + shippingFeePreview);

  const serverOk = !!beQuote && !beQuoteErr;
  const pb = serverOk ? beQuote.pricingBreakdownSnapshot : null;
  const vs = serverOk ? beQuote.voucherSnapshot : null;

  const rowSubtotal = pb ? pb.subtotal : subtotal;
  const rowPromoDisc = pb ? pb.promotionDiscount : promoDiscountPreview;
  const rowVoucherDisc = pb ? pb.voucherDiscount : 0;
  const rowShipFee = pb ? pb.shippingFee : shippingFeePreview;
  const rowShipDisc = pb ? pb.shippingDiscount : promoShippingDiscountPreview;
  const rowShipPayable = Math.max(0, rowShipFee - rowShipDisc);
  const displayTotal = pb ? pb.total : totalPreview;

  const phoneOk = /^[\d+]{9,12}$/.test(phone.replace(/\s/g, ""));
  // Block submit if GHN couldn't map the ward — the address is ambiguous and
  // the local zone fallback may underprice it. User must pick a different ward.
  const addressUnmapped = quote.usedFallback && quote.fallbackReason === "address_unmapped";
  const canSubmit =
    cartItems.length > 0 &&
    name.trim().length > 0 &&
    phoneOk &&
    quote.status === "quoted" &&
    !addressUnmapped &&
    !submitting &&
    !!beQuote &&
    !beQuoteLoading &&
    !beQuoteErr &&
    (!appliedVoucherCode || (vs != null && vs.code.toLowerCase() === appliedVoucherCode.toLowerCase()));

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
      void currentCustomerActions.save({
        name: name.trim(),
        phone: phone.trim(),
      });
      currentCustomerActions.saveDefaultAddress(shippingAddress);

      const order = await pendingOrders.create({
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
    } finally {
      setSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
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
                  }}
                />
                {mappingWarning && (
                  <div className="mt-2 rounded-xl border border-warning/40 bg-warning-soft/40 p-2.5 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning-foreground">{mappingWarning}</p>
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
              <div className="mt-3.5">
                <Field label="Số nhà, đường" value={street} onChange={setStreet} placeholder="VD: 12 Lê Lợi" />
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

              <div className="border-t mt-4 pt-4 space-y-2 text-sm">
                <Row label="Tạm tính" value={formatVND(rowSubtotal)} />
                {bestPromo && rowPromoDisc > 0 && (
                  <Row
                    label={`Khuyến mãi: ${bestPromo.name}`}
                    value={<span className="text-success">−{formatVND(rowPromoDisc)}</span>}
                  />
                )}
                {vs && rowVoucherDisc > 0 && (
                  <Row
                    label={`Voucher: ${vs.code}`}
                    value={<span className="text-success">−{formatVND(rowVoucherDisc)}</span>}
                  />
                )}
                <Row
                  label="Phí giao hàng"
                  value={
                    quoting ? <span className="text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Đang tính…</span> :
                    quote.status === "incomplete" ? <span className="text-muted-foreground">—</span> :
                    quote.status === "unavailable" ? <span className="text-danger">Không khả dụng</span> :
                    quote.status === "quoted" && rowShipPayable === 0 ? <span className="text-success">Miễn phí</span> :
                    quote.status === "quoted" ? formatVND(rowShipPayable) : "—"
                  }
                />
                {rowShipDisc > 0 && (
                  <Row
                    label="Giảm phí giao hàng"
                    value={<span className="text-success">−{formatVND(rowShipDisc)}</span>}
                  />
                )}
                {serverOk && pb && pb.vatAmount > 0 && (
                  <Row label="VAT (máy chủ)" value={formatVND(pb.vatAmount)} />
                )}
                {(beQuoteLoading || beQuoteErr) && (
                  <p className="text-[11px] text-muted-foreground">
                    {beQuoteLoading ? "Đang lấy báo giá máy chủ…" : null}
                    {beQuoteErr ? (
                      <span className="text-amber-700">
                        Báo giá máy chủ thất bại: {beQuoteErr}. Vui lòng sửa địa chỉ / thử lại — không thể tạo đơn khi thiếu báo giá backend.
                      </span>
                    ) : null}
                  </p>
                )}
                {serverOk && (
                  <p className="text-[11px] text-muted-foreground">
                    Giá theo báo giá máy chủ (gồm voucher / KM / phí ship backend).
                  </p>
                )}
                {beQuote?.rewardLines && beQuote.rewardLines.length > 0 && (
                  <div className="rounded-lg bg-success-soft/40 px-3 py-2 text-xs text-success space-y-0.5">
                    <p className="font-semibold">Quà tặng kèm (máy chủ)</p>
                    {beQuote.rewardLines.map((r, i) => (
                      <p key={i}>• {r.productName} ×{r.quantity}</p>
                    ))}
                  </div>
                )}
                {!serverOk && bestPromo && bestPromo.giftLines.length > 0 && (
                  <div className="rounded-lg bg-success-soft/40 px-3 py-2 text-xs text-success space-y-0.5">
                    <p className="font-semibold">🎁 Quà tặng kèm (xem trước)</p>
                    {bestPromo.giftLines.map((g, i) => (
                      <p key={i}>• {g.productName} ×{g.qty}</p>
                    ))}
                  </div>
                )}
                <div className="border-t pt-3 flex justify-between items-baseline">
                  <span className="font-bold">Tổng cộng</span>
                  <span className="font-bold text-foreground text-xl">{formatVND(displayTotal)}</span>
                </div>
              </div>
              <button
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
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
