import { useState, useRef, useEffect, useMemo } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { QuantityStepper } from "@/components/shared/QuantityStepper";
import { SearchableCombobox } from "@/components/shared/SearchableCombobox";
import { CustomerFormDrawer } from "@/components/shared/CustomerFormDrawer";
import { formatVND } from "@/lib/format";
import {
  Search, Barcode, Camera, Keyboard, ShoppingCart, Receipt,
  AlertTriangle, Printer, X, Check, CheckCircle2, ScanLine,
  Tag, Gift, Truck, ChevronUp, ChevronDown,
  Banknote, Landmark, Wallet, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Printable58Invoice } from "@/components/shared/Printable58Invoice";
import { triggerPrint } from "@/lib/print";
import type { Invoice, InvoiceLine } from "@/lib/pos-print-types";
import { normalizeScanCode } from "@/lib/scan-code";
import { CameraScanner } from "@/components/pos/CameraScanner";
import { PosQrDialog, type PosQrPaymentType } from "@/components/pos/PosQrDialog";
import { computeInvoice, type POSCartLine } from "@/lib/pos-invoice";
import { buildBackendPosPrintSnapshot } from "@/lib/pos-quote-receipt";
import { formatPromotionSummary, PROMOTION_TYPE_LABELS, type Promotion } from "@/lib/promotions";
import { adminCustomers, products as productService, promotions as promotionEvaluationService, promotionsCrud, shipping } from "@/services";
import { useService } from "@/hooks/useService";
import type { CartContext, EvaluatedPromotion, ShippingConfig, ShippingZoneRule } from "@/services/types";
import { fetchPosScan, type PosScanDto } from "@/services/pos/posScanApi";
import { adminFetchJson, getAdminSession } from "@/services/auth/adminApi";
import { postSalesQuoteAsPos } from "@/services/sales/salesQuoteApi";
import {
  searchVariantsForTransaction,
  type VariantTransactionSearchHit,
} from "@/services/catalog/variantTransactionSearch";

type PosCatalogProduct = { active?: boolean; variants: PosCatalogVariant[] };
type PosCatalogVariant = { active?: boolean; isSellable?: boolean; isDefault?: boolean };

export function isPosSellableVariant(v: PosCatalogVariant): boolean {
  return v.active !== false && v.isSellable !== false;
}

export function pickPosSellableVariant<T extends PosCatalogVariant>(p: { variants: T[] }): T | null {
  const variants = p.variants.filter(isPosSellableVariant);
  return variants.find((v) => v.isDefault) || variants[0] || null;
}

export function isPosRenderableProduct(p: PosCatalogProduct): boolean {
  return p.active === true && pickPosSellableVariant(p) != null;
}

type BackendSalesInvoiceResponse = {
  id: number;
  invoiceNo: string;
  finalAmount: string | number;
  totalAmount?: string | number;
  discountAmount?: string | number;
};

type ScanMode = "hid" | "camera" | "manual";

export default function AdminPOS() {
  const { data: productData } = useService(() => productService.list({ page: 1, pageSize: 200, forSaleOnly: true }), []);
  const { data: customerData, reload: reloadCustomers } = useService(
      () => adminCustomers.list({ pageSize: 100 }),
      [],
  );
  const storeProducts = productData?.items ?? [];
  const customers = customerData?.items ?? [];
  const [lines, setLines] = useState<POSCartLine[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>("hid");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [note, setNote] = useState("");
  const [scanFlash, setScanFlash] = useState<"ok" | "err" | null>(null);
  const [lastInvoice, setLastInvoice] = useState<{ number: string; total: number } | null>(null);
  /** After backend quote checkout — drives 58mm print so rewards/totals match server, not local draft. */
  const [lastPrintableInvoice, setLastPrintableInvoice] = useState<Invoice | null>(null);
  const [lastPrintableLines, setLastPrintableLines] = useState<InvoiceLine[] | null>(null);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [vatPercent, setVatPercent] = useState<number>(0);
  const [promotionId, setPromotionId] = useState<string>("");
  const [shippingZoneCode, setShippingZoneCode] = useState<string>("");
  const [shippingZones, setShippingZones] = useState<ShippingZoneRule[]>([]);
  const [paymentType, setPaymentType] = useState<Invoice["paymentType"]>("cash");
  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const customerCountRef = useState({ n: customers.length })[0];
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [posVariantHits, setPosVariantHits] = useState<VariantTransactionSearchHit[]>([]);
  const [posVariantLoading, setPosVariantLoading] = useState(false);
  const [posVariantSearchErr, setPosVariantSearchErr] = useState<string | null>(null);
  const posSearchDebounceRef = useRef<number>(0);
  const posSearchAbortRef = useRef<AbortController | null>(null);
  const posSearchSeqRef = useRef(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [posVoucherCode, setPosVoucherCode] = useState("");
  const [backendPromotions, setBackendPromotions] = useState<Promotion[]>([]);
  const [promotionLoadError, setPromotionLoadError] = useState<string | null>(null);
  const [promotionEvaluations, setPromotionEvaluations] = useState<EvaluatedPromotion[]>([]);
  const [promotionEvalError, setPromotionEvalError] = useState<string | null>(null);

  // Load shipping zones once so cashiers can attach a zone code + ETA to the receipt.
  useEffect(() => {
    let cancel = false;
    void shipping.getConfig().then((cfg: ShippingConfig) => {
      if (!cancel) setShippingZones(cfg.zoneRules);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const selectedShippingZone = useMemo(
      () => shippingZones.find((z) => z.zoneCode === shippingZoneCode) ?? null,
      [shippingZones, shippingZoneCode],
  );

  // Auto-select newly created customer
  useEffect(() => {
    if (customers.length > customerCountRef.n) {
      setSelectedCustomer(customers[0].id);
      customerCountRef.n = customers.length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.length]);

  const productCategory = useMemo(() => {
    const m = Object.fromEntries(storeProducts.map((p) => [p.id, p.categoryId]));
    for (const h of posVariantHits) {
      if (h.categoryId) m[h.productId] = h.categoryId;
    }
    return m;
  }, [storeProducts, posVariantHits]);

  useEffect(() => {
    const q = search.trim();
    window.clearTimeout(posSearchDebounceRef.current);
    if (q.length < 2) {
      posSearchAbortRef.current?.abort();
      setPosVariantHits([]);
      setPosVariantLoading(false);
      setPosVariantSearchErr(null);
      return;
    }
    posSearchDebounceRef.current = window.setTimeout(() => {
      posSearchAbortRef.current?.abort();
      const ac = new AbortController();
      posSearchAbortRef.current = ac;
      const seq = ++posSearchSeqRef.current;
      setPosVariantLoading(true);
      setPosVariantSearchErr(null);
      void searchVariantsForTransaction({ search: q, context: "pos", page: 0, size: 40, signal: ac.signal })
          .then((res) => {
            if (seq !== posSearchSeqRef.current) return;
            setPosVariantHits(res.items.filter((hit) => hit.active !== false && hit.isSellable !== false));
          })
          .catch((e: unknown) => {
            if (e instanceof Error && e.name === "AbortError") return;
            if (seq !== posSearchSeqRef.current) return;
            setPosVariantHits([]);
            setPosVariantSearchErr(e instanceof Error ? e.message : "Lỗi tìm kiếm");
          })
          .finally(() => {
            if (seq === posSearchSeqRef.current) setPosVariantLoading(false);
          });
    }, 250);
    return () => window.clearTimeout(posSearchDebounceRef.current);
  }, [search]);

  const addProductByVariantSearchHit = (hit: VariantTransactionSearchHit) => {
    if (hit.active === false || hit.isSellable === false) {
      toast.error("Variant không bán tại POS/storefront (isSellable=false)");
      return;
    }
    const variant = {
      id: hit.variantId,
      code: hit.variantCode,
      name: hit.variantName,
      sellPrice: hit.sellPrice,
      stock: hit.stockQty,
      minStock: hit.minStockQty,
      sellUnit: hit.sellUnit,
      importUnit: hit.importUnit,
      piecesPerImportUnit: hit.piecesPerUnit,
      costPrice: hit.costPrice,
      expiryDays: hit.expiryDays ?? 0,
      isDefault: false,
      isSellable: hit.isSellable,
    };
    addProductByVariant(hit.productId, hit.productName, variant as (typeof storeProducts)[number]["variants"][number]);
  };

  useEffect(() => {
    let cancel = false;
    void promotionsCrud.list({ page: 1, pageSize: 200, active: true })
        .then((res) => {
          if (cancel) return;
          setBackendPromotions(res.items);
          setPromotionLoadError(null);
        })
        .catch((e) => {
          if (cancel) return;
          setBackendPromotions([]);
          setPromotionLoadError(e instanceof Error ? e.message : "Không tải được khuyến mãi backend");
        });
    return () => {
      cancel = true;
    };
  }, []);

  // Real POS promotion source is backend DB. Local promotion helpers may still
  // render demo/offline previews elsewhere, but this selector never reads local store IDs.
  const activePromotions = useMemo(
      () => backendPromotions.filter((p) => p.active),
      [backendPromotions],
  );
  const selectedPromotion: Promotion | null =
      activePromotions.find((p) => p.id === promotionId) ?? null;

  const promotionEvaluationById = useMemo(
      () => Object.fromEntries(promotionEvaluations.map((p) => [p.promotionId, p])),
      [promotionEvaluations],
  );
  const selectedPromotionEvaluation = selectedPromotion ? promotionEvaluationById[selectedPromotion.id] : undefined;
  const selectedPromotionBackendEligible = selectedPromotionEvaluation?.eligible === true;
  const promotionForLocalTotals = selectedPromotionBackendEligible ? selectedPromotion : null;

  useEffect(() => {
    let cancel = false;
    const billable = lines.filter((l) => !l.reward);
    if (billable.length === 0 || activePromotions.length === 0) {
      setPromotionEvaluations([]);
      setPromotionEvalError(null);
      return;
    }
    const subtotal = billable.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const ctx: CartContext = {
      lines: billable.map((l) => ({
        id: l.id,
        productId: l.productId,
        variantId: l.variantId ?? "",
        productName: l.productName,
        variantName: l.variantName,
        qty: l.quantity,
        unitPrice: l.unitPrice,
        lineSubtotal: l.unitPrice * l.quantity,
      })),
      subtotal,
      shippingQuote: { status: "quoted", fee: shippingFee },
    };
    void promotionEvaluationService.evaluateAll(ctx)
        .then((rows) => {
          if (cancel) return;
          setPromotionEvaluations(rows);
          setPromotionEvalError(null);
        })
        .catch((e) => {
          if (cancel) return;
          setPromotionEvaluations([]);
          setPromotionEvalError(e instanceof Error ? e.message : "Không đánh giá được khuyến mãi backend");
        });
    return () => {
      cancel = true;
    };
  }, [activePromotions.length, lines, shippingFee]);

  // Compute totals
  const totals = useMemo(
      () => computeInvoice({
        lines,
        manualDiscount: { mode: discountMode, value: discountValue },
        promotion: promotionForLocalTotals,
        shippingFee,
        vatPercent,
        productCategory,
      }),
      [lines, discountMode, discountValue, promotionForLocalTotals, shippingFee, vatPercent, productCategory],
  );

  const billable = lines.filter((l) => !l.reward);
  const hasBatchCart = billable.some((l) => !!l.batchId);
  const overStockLine = lines.find((l) => !l.reward && l.quantity > l.stock);

  const checkoutDisabledReason =
      billable.length === 0 ? "Chưa có sản phẩm" :
          checkoutBusy ? "Đang tạo hóa đơn…" :
              null;
  const checkoutStockReason = !checkoutDisabledReason && overStockLine
      ? `Sản phẩm "${overStockLine.productName}" vượt tồn kho`
      : null;
  const checkoutFeeReason =
      !checkoutDisabledReason && !checkoutStockReason && shippingFee < 0 ? "Phí ship không hợp lệ" :
          !checkoutDisabledReason && !checkoutStockReason && (vatPercent < 0 || vatPercent > 100) ? "VAT không hợp lệ" :
              null;
  const blockedCheckoutReason = checkoutDisabledReason ?? checkoutStockReason ?? checkoutFeeReason;

  useEffect(() => {
    setLines((prev) => {
      const real = prev.filter((l) => !l.reward);
      if (real.some((l) => !!l.batchId)) {
        return real.length === prev.length && !prev.some((l) => l.reward) ? prev : real;
      }
      const rewards: POSCartLine[] = totals.freeItems.map((g) => ({
        id: `reward-${g.productId}`,
        productId: g.productId,
        productName: g.productName,
        variantName: "Quà tặng",
        variantCode: "GIFT",
        unitPrice: 0,
        quantity: g.quantity,
        stock: 9999,
        reward: true,
        rewardSource: selectedPromotion?.name,
      }));
      const next = [...real, ...rewards];
      if (next.length === prev.length && next.every((l, i) => l.id === prev[i]?.id && l.quantity === prev[i]?.quantity && l.reward === prev[i]?.reward)) {
        return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(totals.freeItems), selectedPromotion?.id, hasBatchCart]);

  const totalItems = lines.reduce((s, l) => s + l.quantity, 0);

  // HID mode focus management
  useEffect(() => {
    if (scanMode !== "hid") return;
    const refocus = () => {
      const ae = document.activeElement as HTMLElement | null;
      const tag = ae?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ae?.isContentEditable;
      if (!isEditable) barcodeRef.current?.focus();
    };
    refocus();
    const onWinFocus = () => barcodeRef.current?.focus();
    const onClick = () => setTimeout(refocus, 0);
    window.addEventListener("focus", onWinFocus);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("focus", onWinFocus);
      document.removeEventListener("click", onClick);
    };
  }, [scanMode]);

  const numFromApi = (v: string | number | null | undefined) =>
      v == null || v === "" ? 0 : typeof v === "number" ? v : Number(v);

  const posPaymentToBackend = (t: Invoice["paymentType"]): string => {
    switch (t) {
      case "transfer":
        return "bank_transfer";
      case "momo":
        return "momo";
      case "zalopay":
        return "zalopay";
      default:
        return "cash";
    }
  };

  const addProductByVariant = (productId: string, productName: string, variant: typeof storeProducts[number]["variants"][number]) => {
    if (variant.active === false || variant.isSellable === false) {
      toast.error(`${productName} — ${variant.name} không bán tại POS/storefront (isSellable=false)`);
      return;
    }
    if (variant.stock === 0) {
      toast.error(`${productName} đã hết hàng`);
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => !l.batchId && l.variantCode === variant.code && !l.reward);
      if (existing) {
        return prev.map((l) => (l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${variant.code}`,
          productId,
          variantId: variant.id,
          productName,
          variantName: variant.name,
          variantCode: variant.code,
          unitPrice: variant.sellPrice,
          quantity: 1,
          stock: variant.stock,
        },
      ];
    });
  };

  const addOrMergeBatchLine = (input: {
    productId: string;
    variantId: string;
    productName: string;
    variantName: string;
    variantCode: string;
    unitPrice: number;
    batchId: string;
    batchCode: string;
    batchExpiryDate?: string;
    remainingQty: number;
  }) => {
    if (input.remainingQty <= 0) {
      toast.error("Lô không còn tồn để bán");
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.batchId === input.batchId && !l.reward);
      if (existing) {
        const nextQty = existing.quantity + 1;
        if (nextQty > existing.stock) {
          toast.error("Không đủ tồn trong lô đã quét");
          return prev;
        }
        return prev.map((l) => (l.id === existing.id ? { ...l, quantity: nextQty } : l));
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-b-${input.batchId}`,
          productId: input.productId,
          variantId: input.variantId,
          productName: input.productName,
          variantName: input.variantName,
          variantCode: input.variantCode,
          unitPrice: input.unitPrice,
          quantity: 1,
          stock: input.remainingQty,
          batchId: input.batchId,
          batchCode: input.batchCode,
          batchExpiryDate: input.batchExpiryDate,
          remainingQty: input.remainingQty,
        },
      ];
    });
  };

  const addVariantLineFromBackendScan = (scan: PosScanDto) => {
    if (scan.productId == null || scan.variantId == null) {
      toast.error(scan.blockReason || "Scan thiếu product/variant từ backend");
      setScanFlash("err");
      setTimeout(() => setScanFlash(null), 700);
      return;
    }
    const stock = Math.max(0, Number(scan.variantStockQty ?? 0));
    if (stock <= 0) {
      toast.error(`${scan.productName ?? "Sản phẩm"} đã hết hàng`);
      setScanFlash("err");
      setTimeout(() => setScanFlash(null), 700);
      return;
    }
    const vCode = (scan.variantCode || "").trim();
    if (!vCode) {
      toast.error("Thiếu mã variant từ backend");
      setScanFlash("err");
      setTimeout(() => setScanFlash(null), 700);
      return;
    }
    const productId = String(scan.productId);
    const variantId = String(scan.variantId);
    const productName = String(scan.productName ?? "");
    const variantName = String(scan.variantName ?? "");
    const unitPrice = numFromApi(scan.price);

    setLines((prev) => {
      const existing = prev.find((l) => !l.batchId && l.variantId === variantId && !l.reward);
      if (existing) {
        const nextQty = existing.quantity + 1;
        if (nextQty > existing.stock) {
          toast.error("Không đủ tồn kho để thêm");
          return prev;
        }
        return prev.map((l) => (l.id === existing.id ? { ...l, quantity: nextQty } : l));
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${vCode}`,
          productId,
          variantId,
          productName,
          variantName,
          variantCode: vCode,
          unitPrice,
          quantity: 1,
          stock,
        },
      ];
    });
    toast.success(`Đã thêm ${productName} — ${variantName}`);
    setScanFlash("ok");
    setTimeout(() => setScanFlash(null), 500);
  };

  const handleScannedCode = async (rawCode: string) => {
    const code = normalizeScanCode(rawCode);
    if (!code) return;

    const looksBatch = /^batch:/i.test(code);

    try {
      const scan = await fetchPosScan(code);

      if (scan.kind === "batch") {
        if (!scan.sellable) {
          toast.error(scan.blockReason || "Không thể bán lô này");
          setScanFlash("err");
          setTimeout(() => setScanFlash(null), 700);
          return;
        }
        if (scan.productId == null || scan.variantId == null || scan.batchId == null) {
          toast.error(scan.blockReason || "Scan lô không hợp lệ");
          setScanFlash("err");
          setTimeout(() => setScanFlash(null), 700);
          return;
        }
        addOrMergeBatchLine({
          productId: String(scan.productId),
          variantId: String(scan.variantId),
          productName: String(scan.productName ?? ""),
          variantName: String(scan.variantName ?? ""),
          variantCode: String(scan.variantCode ?? ""),
          unitPrice: numFromApi(scan.price),
          batchId: String(scan.batchId),
          batchCode: String(scan.batchCode ?? ""),
          batchExpiryDate: scan.expiryDate ?? undefined,
          remainingQty: Number(scan.remainingQty ?? 0),
        });
        toast.success(`Đã thêm lô ${scan.batchCode ?? scan.batchId} — ${scan.productName ?? ""}`);
        setScanFlash("ok");
        setTimeout(() => setScanFlash(null), 500);
        return;
      }

      if (scan.kind === "variant") {
        if (!scan.sellable) {
          toast.error(scan.blockReason || "Không thể bán mã này");
          setScanFlash("err");
          setTimeout(() => setScanFlash(null), 700);
          return;
        }
        addVariantLineFromBackendScan(scan);
        return;
      }

      toast.error(scan.blockReason || "Không đọc được mã quét");
      setScanFlash("err");
      setTimeout(() => setScanFlash(null), 700);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không kết nối được máy chủ quét mã";
      toast.error(
          looksBatch
              ? msg || "Lỗi scan lô (backend)"
              : `Không quét được mã từ backend — không thêm vào giỏ. ${msg} Kiểm tra mạng, đăng nhập admin, hoặc thử quét lại.`,
      );
      setScanFlash("err");
      setTimeout(() => setScanFlash(null), 700);
    }
  };
  const handleBarcodeSubmit = () => { void handleScannedCode(barcodeInput); setBarcodeInput(""); };

  const updateLine = (id: string, qty: number) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, quantity: qty } : l)));
  };
  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const catalogVariantSellPrice = (productId: string, variantId?: string): number | null => {
    const p = storeProducts.find((x) => x.id === productId);
    if (!p) return null;
    if (variantId) {
      const v = p.variants.find((x) => x.id === variantId);
      if (v) return v.sellPrice;
    }
    const def = p.variants.find((x) => x.isDefault) ?? p.variants[0];
    return def ? def.sellPrice : null;
  };

  const lineDiscountPercentForBackend = (line: POSCartLine): number => {
    const base = catalogVariantSellPrice(line.productId, line.variantId);
    if (!base || base <= 0) return 0;
    const pct = (1 - line.unitPrice / base) * 100;
    if (!Number.isFinite(pct)) return 0;
    return Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
  };

  const parseOptionalLong = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const handleCheckout = async () => {
    if (blockedCheckoutReason) {
      toast.error(blockedCheckoutReason);
      return;
    }

    const snapshotLines = lines.map((l) => ({
      name: `${l.productName} - ${l.variantName}${l.reward ? " (Quà tặng)" : ""}`,
      code: l.variantCode,
      qty: l.quantity,
      price: l.unitPrice,
      reward: l.reward,
      rewardSource: l.rewardSource,
    }));

    const breakdown = {
      subtotal: totals.subtotal,
      manualDiscount: totals.manualDiscount,
      promoDiscount: totals.promoDiscount,
      promoName: selectedPromotion?.name,
      shippingFee: totals.shippingFee,
      shippingDiscount: totals.shippingDiscount,
      shippingPayable: totals.shippingPayable,
      shippingZoneCode: selectedShippingZone?.zoneCode,
      shippingZoneLabel: selectedShippingZone?.label,
      shippingEtaMin: selectedShippingZone?.etaDays.min,
      shippingEtaMax: selectedShippingZone?.etaDays.max,
      vatPercent,
      vatBase: totals.vatBase,
      vatAmount: totals.vatAmount,
      total: totals.total,
      freeItems: totals.freeItems.map((g) => ({ productName: g.productName, quantity: g.quantity })),
    };

    if (hasBatchCart) {
      setCheckoutBusy(true);
      try {
        const shipSnap =
            shippingFee !== 0 || !!shippingZoneCode
                ? {
                  source: "client_snapshot" as const,
                  zoneCode: shippingZoneCode || selectedShippingZone?.zoneCode,
                  fee: shippingFee,
                  etaDays: selectedShippingZone?.etaDays,
                }
                : null;

        const promoRaw = promotionId.trim();
        const promotionBackendId =
            promoRaw && Number.isFinite(Number(promoRaw)) ? Number(promoRaw) : null;

        const quoteLines = billable.map((line) => {
          const productId = parseOptionalLong(line.productId);
          if (productId == null) throw new Error(`productId không hợp lệ cho ${line.productName}`);
          const variantId = line.variantId ? parseOptionalLong(line.variantId) : null;
          if (variantId == null) throw new Error(`variantId không hợp lệ cho ${line.productName}`);
          const batchId = line.batchId ? parseOptionalLong(line.batchId) : null;
          if (line.batchId && batchId == null) throw new Error("batchId không hợp lệ");
          return {
            productId,
            variantId,
            quantity: line.quantity,
            discountPercent: lineDiscountPercentForBackend(line),
            batchId,
          };
        });

        const quote = await postSalesQuoteAsPos({
          source: "pos",
          customerId: selectedCustomer || null,
          lines: quoteLines,
          promotionId: promotionBackendId,
          voucherCode: posVoucherCode.trim() || null,
          shippingQuoteSnapshot: shipSnap,
          manualDiscount: totals.manualDiscount,
          vatPercent,
        });

        const customerId = parseOptionalLong(selectedCustomer);

        const created = await adminFetchJson<BackendSalesInvoiceResponse>("/api/invoices", {
          method: "POST",
          body: JSON.stringify({
            customerName:
                (customerId == null ? customers.find((c) => c.id === selectedCustomer)?.name : undefined) ||
                "Khách lẻ",
            customerId,
            note: note.trim() || null,
            promotionId: null,
            quotePublicId: quote.quoteId,
            paymentMethod: posPaymentToBackend(paymentType),
          }),
        });

        const paid = numFromApi(created.finalAmount);
        const iso = new Date().toISOString();
        const snap = buildBackendPosPrintSnapshot({
          quote,
          cartLines: lines,
          invoiceNo: created.invoiceNo,
          paid,
          isoDate: iso,
          customerId: selectedCustomer || "",
          customerName: customers.find((c) => c.id === selectedCustomer)?.name || "Khách lẻ",
          paymentType,
          promotionName: selectedPromotion?.name,
          selectedShippingZone,
          note: note.trim() || undefined,
        });
        setLastPrintableInvoice({ id: `be-${created.invoiceNo}`, ...snap.invoiceForStore });
        setLastPrintableLines(snap.lines);
        setLastInvoice({ number: created.invoiceNo, total: paid });
        toast.success(`Đã tạo hóa đơn ${created.invoiceNo} (backend quote + lô)`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tạo được hóa đơn backend");
      } finally {
        setCheckoutBusy(false);
      }
      return;
    }

    const allowLocalInvoiceDemo =
        import.meta.env.MODE === "test" || import.meta.env.VITE_POS_LOCAL_INVOICE_DEMO === "true";
    const hasAdminSession = Boolean(getAdminSession()?.accessToken);

    if (!hasAdminSession && !allowLocalInvoiceDemo) {
      toast.error(
          "Cần đăng nhập phiên admin (backend) để lập hóa đơn thật. Hóa đơn chỉ được lưu trên máy chủ — không tạo hóa đơn cục bộ.",
      );
      return;
    }

    if (hasAdminSession) {
      setCheckoutBusy(true);
      try {
        const shipSnap =
            shippingFee !== 0 || !!shippingZoneCode
                ? {
                  source: "client_snapshot" as const,
                  zoneCode: shippingZoneCode || selectedShippingZone?.zoneCode,
                  fee: shippingFee,
                  etaDays: selectedShippingZone?.etaDays,
                }
                : null;

        const promoRaw = promotionId.trim();
        const promotionBackendId =
            promoRaw && Number.isFinite(Number(promoRaw)) ? Number(promoRaw) : null;

        const quoteLines = billable.map((line) => {
          const productId = parseOptionalLong(line.productId);
          if (productId == null) throw new Error(`productId không hợp lệ cho ${line.productName}`);
          const variantId = line.variantId ? parseOptionalLong(line.variantId) : null;
          if (variantId == null) throw new Error(`variantId không hợp lệ cho ${line.productName}`);
          return {
            productId,
            variantId,
            quantity: line.quantity,
            discountPercent: lineDiscountPercentForBackend(line),
            batchId: undefined,
          };
        });

        const quote = await postSalesQuoteAsPos({
          source: "pos",
          customerId: selectedCustomer || null,
          lines: quoteLines,
          promotionId: promotionBackendId,
          voucherCode: posVoucherCode.trim() || null,
          shippingQuoteSnapshot: shipSnap,
          manualDiscount: totals.manualDiscount,
          vatPercent,
        });

        const customerId = parseOptionalLong(selectedCustomer);

        const created = await adminFetchJson<BackendSalesInvoiceResponse>("/api/invoices", {
          method: "POST",
          body: JSON.stringify({
            customerName:
                (customerId == null ? customers.find((c) => c.id === selectedCustomer)?.name : undefined) ||
                "Khách lẻ",
            customerId,
            note: note.trim() || null,
            promotionId: null,
            quotePublicId: quote.quoteId,
            paymentMethod: posPaymentToBackend(paymentType),
          }),
        });

        const paid = numFromApi(created.finalAmount);
        const iso = new Date().toISOString();
        const snap = buildBackendPosPrintSnapshot({
          quote,
          cartLines: lines,
          invoiceNo: created.invoiceNo,
          paid,
          isoDate: iso,
          customerId: selectedCustomer || "",
          customerName: customers.find((c) => c.id === selectedCustomer)?.name || "Khách lẻ",
          paymentType,
          promotionName: selectedPromotion?.name,
          selectedShippingZone,
          note: note.trim() || undefined,
        });
        setLastPrintableInvoice({ id: `be-${created.invoiceNo}`, ...snap.invoiceForStore });
        setLastPrintableLines(snap.lines);
        setLastInvoice({ number: created.invoiceNo, total: paid });
        toast.success(`Đã tạo hóa đơn ${created.invoiceNo} (backend quote)`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không tạo được hóa đơn backend");
      } finally {
        setCheckoutBusy(false);
      }
      return;
    }

    toast.error("Không tạo hóa đơn cục bộ trong production. Vui lòng đăng nhập backend admin.");
  };

  const handleNewInvoice = () => {
    setLines([]); setNote(""); setSelectedCustomer(""); setLastInvoice(null);
    setLastPrintableInvoice(null);
    setLastPrintableLines(null);
    setDiscountValue(0); setDiscountMode("amount");
    setShippingFee(0); setVatPercent(0); setPromotionId("");
    setShippingZoneCode(""); setPaymentType("cash");
    barcodeRef.current?.focus();
  };

  const handlePrint = () => {
    if (!lastInvoice && lines.length === 0) { toast.error("Chưa có hóa đơn để in"); return; }
    triggerPrint(lastInvoice?.number ?? "hóa đơn nháp", "pos58", { targetId: "print-root-invoice-pos58" });
  };

  // In-memory invoice used for the live preview / print of the current draft.
  // Mirror the same breakdown so the printed receipt shows zone + ETA before saving.
  const printableInvoice: Invoice = {
    id: "pos-current",
    number: lastInvoice?.number ?? "HD-NHAP",
    date: new Date().toISOString(),
    customerId: selectedCustomer || "",
    customerName: customers.find((c) => c.id === selectedCustomer)?.name || "Khách lẻ",
    total: lastInvoice?.total ?? totals.total,
    paymentType, status: "active", createdBy: "admin", itemCount: totalItems,
    breakdown: {
      subtotal: totals.subtotal,
      manualDiscount: totals.manualDiscount,
      promoDiscount: totals.promoDiscount,
      promoName: selectedPromotion?.name,
      shippingFee: totals.shippingFee,
      shippingDiscount: totals.shippingDiscount,
      shippingPayable: totals.shippingPayable,
      shippingZoneCode: selectedShippingZone?.zoneCode,
      shippingZoneLabel: selectedShippingZone?.label,
      shippingEtaMin: selectedShippingZone?.etaDays.min,
      shippingEtaMax: selectedShippingZone?.etaDays.max,
      vatPercent,
      vatBase: totals.vatBase,
      vatAmount: totals.vatAmount,
      total: totals.total,
      freeItems: totals.freeItems.map((g) => ({ productName: g.productName, quantity: g.quantity })),
    },
  };
  const printableLines = lines.map((l) => ({
    name: `${l.productName} - ${l.variantName}${l.reward ? " (Quà tặng)" : ""}`,
    code: l.variantCode, qty: l.quantity, price: l.unitPrice,
  }));

  /** Committed backend quote checkout → 58mm uses quote snapshot; else draft/local preview. */
  const useBackendPos58Print =
      lastInvoice != null && lastPrintableInvoice != null && lastPrintableLines != null;
  const pos58Empty: InvoiceLine = { name: "Hóa đơn trống", code: "-", qty: 0, price: 0 };
  const pos58Invoice = useBackendPos58Print ? lastPrintableInvoice : printableInvoice;
  const pos58Lines = useBackendPos58Print
      ? lastPrintableLines.length > 0
          ? lastPrintableLines
          : [pos58Empty]
      : printableLines.length > 0
          ? printableLines
          : [pos58Empty];

  const filteredProducts = storeProducts.filter((p) =>
      isPosRenderableProduct(p) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
  );

  // Build promotion options from backend promotion rows + backend stateless evaluation.
  // If evaluation fails, keep backend-loaded options visible but do not claim eligibility.
  const promoOptions = useMemo(() => {
    const evaluated = activePromotions.map((p) => ({ p, evalRow: promotionEvaluationById[p.id] }));
    evaluated.sort((a, b) => {
      const aEligible = a.evalRow?.eligible === true;
      const bEligible = b.evalRow?.eligible === true;
      if (aEligible !== bEligible) return aEligible ? -1 : 1;
      return a.p.name.localeCompare(b.p.name);
    });
    return evaluated.map(({ p, evalRow }) => {
      const eligible = evalRow?.eligible === true;
      const reason = promotionEvalError ? "Chưa xác nhận eligibility từ backend" : evalRow?.reasonIfIneligible;
      return {
        id: p.id,
        label: p.name,
        sub: `${PROMOTION_TYPE_LABELS[p.type]} · ${formatPromotionSummary(p)}${!eligible && reason ? ` — ${reason}` : ""}`,
        group: eligible ? "Đủ điều kiện (backend)" : "Khuyến mãi backend",
        badge: eligible
            ? { label: "Đủ điều kiện", tone: "success" as const }
            : { label: promotionEvalError ? "Chưa xác nhận" : "Chưa đủ điều kiện", tone: "warning" as const },
      };
    });
  }, [activePromotions, promotionEvaluationById, promotionEvalError]);

  // ------ Render helpers ------
  const SummaryBreakdown = () => (
      <div className="space-y-1.5 text-sm">
        <Row label="Tạm tính" value={formatVND(totals.subtotal)} muted />
        {totals.manualDiscount > 0 && (
            <Row label="Chiết khấu thủ công" value={`-${formatVND(totals.manualDiscount)}`} className="text-danger" />
        )}
        {totals.promoDiscount > 0 && (
            <Row label="Khuyến mãi" value={`-${formatVND(totals.promoDiscount)}`} className="text-danger" />
        )}
        {totals.shippingFee > 0 && (
            <Row label="Phí ship" value={formatVND(totals.shippingFee)} muted />
        )}
        {totals.shippingDiscount > 0 && (
            <Row label="Ưu đãi ship" value={`-${formatVND(totals.shippingDiscount)}`} className="text-danger" />
        )}
        {vatPercent > 0 && (
            <Row label={`VAT (${vatPercent}%)`} value={formatVND(totals.vatAmount)} muted />
        )}
        <div className="border-t pt-2 flex justify-between font-bold text-base">
          <span>Tổng cộng</span>
          <span className="text-primary">{formatVND(totals.total)}</span>
        </div>
      </div>
  );

  const PromotionBlock = () => (
      <div>
        <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
          <Tag className="h-3 w-3" /> Khuyến mãi
        </label>
        <SearchableCombobox
            className="mt-1"
            value={promotionId}
            onChange={setPromotionId}
            disabled={!!lastInvoice || checkoutBusy}
            showEmptyOption
            emptyOptionLabel="Không áp dụng"
            placeholder="Chọn khuyến mãi..."
            options={promoOptions}
        />
        {(promotionLoadError || promotionEvalError) && (
            <p className="mt-1 text-[10px] text-warning">
              {promotionLoadError
                  ? `Không tải được khuyến mãi backend: ${promotionLoadError}`
                  : `Không đánh giá được khuyến mãi backend: ${promotionEvalError}. POS sẽ không áp dụng preview local.`}
            </p>
        )}
        {hasBatchCart && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Giỏ có dòng lô (quét BATCH:…) — thanh toán qua <span className="font-medium">quote backend</span> giữ đúng lô; quà KM do máy chủ tính trong báo giá.
            </p>
        )}
        <div className="mt-2">
          <label className="text-[11px] font-medium text-muted-foreground">Mã voucher (máy chủ)</label>
          <input
              value={posVoucherCode}
              onChange={(e) => setPosVoucherCode(e.target.value)}
              className="mt-1 w-full h-9 px-2 text-xs border rounded-md bg-background"
              placeholder="Tùy chọn"
              disabled={!!lastInvoice || checkoutBusy}
          />
        </div>
        {selectedPromotion && (
            <div className={cn(
                "mt-1.5 p-2 rounded-md text-[11px] border",
                selectedPromotionBackendEligible ? "bg-success-soft border-success/30 text-foreground" : "bg-warning-soft border-warning/30 text-foreground",
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{selectedPromotion.name}</div>
                  <div className="text-muted-foreground">{formatPromotionSummary(selectedPromotion)}</div>
                  {selectedPromotionBackendEligible ? (
                      <div className="mt-1 text-success font-medium">✓ Backend xác nhận đủ điều kiện</div>
                  ) : (
                      <div className="mt-1 text-warning font-medium">⚠ {promotionEvalError ? "Chưa xác nhận từ backend" : selectedPromotionEvaluation?.reasonIfIneligible || "Chưa đủ điều kiện"}</div>
                  )}
                </div>
                <button onClick={() => setPromotionId("")} className="text-muted-foreground hover:text-danger" title="Bỏ khuyến mãi">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
        )}
      </div>
  );

  return (
      <>
        <div className="admin-dense -m-4 lg:-m-6 h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row overflow-hidden no-print">
          {/* Left panel — product picker */}
          <div className="lg:w-80 xl:w-96 border-b lg:border-b-0 lg:border-r bg-card flex flex-col shrink-0 max-h-[40vh] lg:max-h-none">
            <div className="p-3 border-b space-y-2">
              <div className="flex items-center gap-1.5">
                <div className={cn(
                    "relative flex-1 transition-all rounded-md",
                    scanFlash === "ok" && "ring-2 ring-success",
                    scanFlash === "err" && "ring-2 ring-danger animate-pulse",
                )}>
                  <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                      ref={barcodeRef}
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeSubmit(); } }}
                      placeholder={scanMode === "hid" ? "Sẵn sàng quét bằng máy quét HID..." : scanMode === "camera" ? "Dùng camera bên dưới hoặc gõ tay..." : "Nhập mã vạch + Enter"}
                      inputMode={scanMode === "camera" ? "none" : "text"}
                      className="w-full h-9 pl-9 pr-3 text-sm bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                      autoComplete="off"
                      aria-label="Ô nhập mã vạch"
                  />
                </div>
                <div className="flex border rounded-md overflow-hidden">
                  {[
                    { mode: "hid" as const, icon: Barcode, title: "Máy quét HID" },
                    { mode: "camera" as const, icon: Camera, title: "Camera" },
                    { mode: "manual" as const, icon: Keyboard, title: "Thủ công" },
                  ].map((m) => (
                      <button key={m.mode} onClick={() => setScanMode(m.mode)} title={m.title}
                              className={cn("p-1.5 transition-colors", scanMode === m.mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                        <m.icon className="h-3.5 w-3.5" />
                      </button>
                  ))}
                </div>
              </div>

              {scanMode === "hid" && (
                  <div className="flex items-start gap-2 p-2 bg-muted/60 rounded-md text-[11px] text-muted-foreground">
                    <ScanLine className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                    <span>Máy quét HID hoạt động như bàn phím. Giữ con trỏ ở ô mã vạch — mã sẽ tự nhập và Enter để hoàn tất.</span>
                  </div>
              )}
              {scanMode === "camera" && <CameraScanner active onDetected={handleScannedCode} onClose={() => setScanMode("hid")} />}
              {scanMode === "manual" && (
                  <button onClick={handleBarcodeSubmit} className="w-full h-7 text-[11px] bg-secondary hover:bg-secondary/80 rounded-md font-medium">Thêm mã vạch</button>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                    data-testid="pos-product-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm SP / variant (≥2 ký tự — backend)…"
                    className="w-full h-8 pl-9 pr-3 text-sm bg-muted rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {posVariantSearchErr ? (
                  <p className="text-[10px] text-danger">{posVariantSearchErr}</p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
              {search.trim().length >= 2 ? (
                  <div>
                    {posVariantLoading ? (
                        <p className="text-[10px] text-muted-foreground px-1 py-2">Đang tìm variant (backend)…</p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-1.5" data-testid="pos-variant-search-hits">
                      {posVariantHits.map((hit) => {
                        const isOutOfStock = hit.stockQty === 0;
                        const isNotSellable = hit.isSellable === false;
                        const isDisabled = isOutOfStock || isNotSellable;
                        return (
                            <button
                                key={hit.variantId}
                                type="button"
                                data-testid={`pos-variant-hit-${hit.variantCode}`}
                                data-variant-id={hit.variantId}
                                disabled={isDisabled}
                                title={isNotSellable ? "Variant không bán lẻ" : undefined}
                                onClick={() => addProductByVariantSearchHit(hit)}
                                className={cn(
                                    "text-left p-2 rounded-md border text-xs transition-all",
                                    isDisabled
                                        ? "opacity-50 cursor-not-allowed bg-muted"
                                        : "hover:border-primary hover:shadow-sm bg-background active:scale-[0.98]",
                                )}
                            >
                              <p className="font-medium truncate">{hit.productName}</p>
                              <p className="text-muted-foreground truncate font-mono text-[10px]">{hit.variantCode}</p>
                              <p className="text-muted-foreground truncate">{hit.variantName}</p>
                              <div className="flex items-center justify-between mt-1">
                                <span className="font-bold text-primary">{formatVND(hit.sellPrice)}</span>
                                {isNotSellable ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground whitespace-nowrap">
                                      Không bán lẻ
                                    </span>
                                ) : isOutOfStock ? (
                                    <StatusBadge status="out-of-stock" size="sm" />
                                ) : hit.stockQty <= hit.minStockQty ? (
                                    <StatusBadge status="low-stock" label={`${hit.stockQty}`} size="sm" />
                                ) : null}
                              </div>
                            </button>
                        );
                      })}
                    </div>
                    {!posVariantLoading && posVariantHits.length === 0 && !posVariantSearchErr ? (
                        <p className="text-[11px] text-muted-foreground px-1 py-2">Không có variant khớp tìm kiếm.</p>
                    ) : null}
                  </div>
              ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {filteredProducts.map((product) => {
                      const dv = pickPosSellableVariant(product);
                      if (!dv) return null;
                      const isOutOfStock = dv.stock === 0;
                      return (
                          <button key={product.id} disabled={isOutOfStock} onClick={() => addProductByVariant(product.id, product.name, dv)}
                                  className={cn("text-left p-2 rounded-md border text-xs transition-all",
                                      isOutOfStock ? "opacity-50 cursor-not-allowed bg-muted" : "hover:border-primary hover:shadow-sm bg-background active:scale-[0.98]")}>
                            <p className="font-medium truncate">{product.name}</p>
                            <p className="text-muted-foreground truncate">{dv.name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="font-bold text-primary">{formatVND(dv.sellPrice)}</span>
                              {isOutOfStock ? <StatusBadge status="out-of-stock" size="sm" /> :
                                  dv.stock <= dv.minStock ? <StatusBadge status="low-stock" label={`${dv.stock}`} size="sm" /> : null}
                            </div>
                          </button>
                      );
                    })}
                  </div>
              )}
            </div>
          </div>

          {/* Center — Cart lines */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-32 lg:pb-0">
            <div className="p-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                {lastInvoice ? lastInvoice.number : "Hóa đơn mới"}
                <span className="text-muted-foreground font-normal">({totalItems} sản phẩm)</span>
              </h2>
              {lines.length > 0 && !lastInvoice && (
                  <button onClick={() => { setLines([]); toast("Đã xóa hóa đơn nháp"); }} className="text-xs text-muted-foreground hover:text-danger">
                    Xóa tất cả
                  </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {selectedPromotion && !lastInvoice && lines.length > 0 && !selectedPromotionBackendEligible && (
                  <div className="m-3 p-2.5 rounded-md border border-warning/40 bg-warning-soft flex items-start gap-2 text-xs">
                    <Tag className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">
                        {promotionEvalError
                            ? "Chưa xác nhận được khuyến mãi từ backend; POS không áp dụng preview local."
                            : selectedPromotionEvaluation?.reasonIfIneligible || "Khuyến mãi chưa đủ điều kiện theo backend."}
                      </p>
                    </div>
                  </div>
              )}
              {selectedPromotion && !lastInvoice && lines.length > 0 && selectedPromotionBackendEligible && (
                  <div className="m-3 p-2.5 rounded-md border border-success/40 bg-success-soft flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <p className="font-medium text-foreground">
                      Backend xác nhận đủ điều kiện khuyến mãi <span className="font-semibold">{selectedPromotion.name}</span>
                    </p>
                  </div>
              )}
              {lastInvoice ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="rounded-full bg-success-soft p-4 mb-4">
                      <CheckCircle2 className="h-12 w-12 text-success" />
                    </div>
                    <h3 className="font-semibold text-lg">Tạo hóa đơn thành công</h3>
                    <p className="font-mono text-sm text-muted-foreground mt-1">{lastInvoice.number}</p>
                    <p className="text-2xl font-bold text-primary mt-3">{formatVND(lastInvoice.total)}</p>
                    <div className="flex gap-2 mt-6 flex-wrap justify-center">
                      <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border rounded-md hover:bg-muted">
                        <Printer className="h-4 w-4" /> In POS58
                      </button>
                      <button onClick={handleNewInvoice} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
                        <Receipt className="h-4 w-4" /> Hóa đơn mới
                      </button>
                    </div>
                  </div>
              ) : lines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <div className="rounded-full bg-muted p-4 mb-3">
                      <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <p className="font-medium text-muted-foreground">Chưa có sản phẩm</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Quét mã vạch ({scanMode === "hid" ? "máy quét" : scanMode === "camera" ? "camera" : "thủ công"}) hoặc bấm vào sản phẩm bên trái để thêm
                    </p>
                  </div>
              ) : (
                  <div className="divide-y">
                    {lines.map((line, i) => {
                      const overStock = !line.reward && line.quantity > line.stock;
                      return (
                          <div key={line.id}
                               className={cn(
                                   "p-3 flex gap-3 transition-colors",
                                   overStock && "bg-danger-soft/50",
                                   line.reward && "bg-warning-soft/30 border-l-2 border-warning",
                                   !overStock && !line.reward && "hover:bg-muted/30",
                               )}>
                            <div className={cn(
                                "flex items-center justify-center h-8 w-8 rounded text-xs font-bold shrink-0",
                                line.reward ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground",
                            )}>
                              {line.reward ? <Gift className="h-4 w-4" /> : i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                                    {line.productName}
                                    {line.reward && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-warning text-warning-foreground">
                                  Quà tặng
                                </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {line.variantName}{!line.reward && ` · ${line.variantCode}`}
                                    {line.reward && line.rewardSource && ` · từ "${line.rewardSource}"`}
                                  </p>
                                  {line.batchId && !line.reward && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Lô <span className="font-mono">{line.batchCode ?? line.batchId}</span>
                                        {line.batchExpiryDate ? ` · HSD ${line.batchExpiryDate}` : ""}
                                        {line.remainingQty != null ? ` · còn ${line.remainingQty}` : ""}
                                      </p>
                                  )}
                                </div>
                                {!line.reward && (
                                    <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-danger shrink-0 p-0.5" title="Xóa dòng">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                              </div>
                              {overStock && (
                                  <p className="text-[11px] text-danger flex items-center gap-1 mt-0.5">
                                    <AlertTriangle className="h-3 w-3" /> Vượt tồn kho (còn {line.stock})
                                  </p>
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-3">
                                  {line.reward ? (
                                      <span className="text-xs font-medium px-2 py-1 bg-muted rounded">SL: {line.quantity}</span>
                                  ) : (
                                      <QuantityStepper value={line.quantity} onChange={(v) => updateLine(line.id, v)} size="sm" max={line.stock} />
                                  )}
                                  <span className="text-xs text-muted-foreground">× {line.reward ? "0đ" : formatVND(line.unitPrice)}</span>
                                </div>
                                <span className={cn("font-bold text-sm", line.reward && "text-success")}>
                            {line.reward ? "Miễn phí" : formatVND(line.unitPrice * line.quantity)}
                          </span>
                              </div>
                            </div>
                          </div>
                      );
                    })}
                  </div>
              )}
            </div>
          </div>

          {/* Right panel — Summary (desktop) */}
          <div className="hidden lg:flex lg:w-80 xl:w-96 border-l bg-card flex-col shrink-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
              {/* Customer */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Khách hàng</label>
                <SearchableCombobox className="mt-1" value={selectedCustomer} onChange={setSelectedCustomer}
                                    disabled={!!lastInvoice} showEmptyOption emptyOptionLabel="Khách lẻ"
                                    placeholder="Tìm SĐT, tên khách..."
                                    options={customers.filter((c) => c.active).map((c) => ({ id: c.id, label: c.name, sub: `${c.code} · ${c.phone}` }))}
                                    onCreateNew={() => setCustomerDrawerOpen(true)} createLabel="Tạo khách hàng mới" />
              </div>

              {/* Note */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Ghi chú</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} disabled={!!lastInvoice}
                       placeholder="Ghi chú hóa đơn..."
                       className="mt-1 w-full h-8 px-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60" />
              </div>

              {/* Payment method */}
              <PaymentMethodPicker
                  value={paymentType}
                  onChange={setPaymentType}
                  disabled={!!lastInvoice}
                  onOpenQr={paymentType !== "cash" && totals.total > 0 ? () => setQrDialogOpen(true) : undefined}
              />

              {/* Promotion */}
              <PromotionBlock />

              {/* Manual discount */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Chiết khấu thủ công</label>
                <div className="mt-1 flex items-center gap-1">
                  <input type="number" min={0} value={discountValue || ""}
                         onChange={(e) => setDiscountValue(Math.max(0, +e.target.value || 0))}
                         disabled={!!lastInvoice || lines.length === 0 || checkoutBusy} placeholder="0"
                         className="flex-1 h-8 px-2 text-sm text-right bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60" />
                  <div className="flex border rounded-md overflow-hidden h-8">
                    <button type="button" onClick={() => setDiscountMode("amount")} disabled={!!lastInvoice || checkoutBusy}
                            className={cn("px-2 text-xs font-medium transition-colors", discountMode === "amount" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>₫</button>
                    <button type="button" onClick={() => setDiscountMode("percent")} disabled={!!lastInvoice || checkoutBusy}
                            className={cn("px-2 text-xs font-medium transition-colors border-l", discountMode === "percent" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>%</button>
                  </div>
                </div>
              </div>

              {/* Shipping zone (printed on receipt for delivery verification) */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Vùng giao hàng
                </label>
                <select
                    value={shippingZoneCode}
                    onChange={(e) => setShippingZoneCode(e.target.value)}
                    disabled={!!lastInvoice || checkoutBusy}
                    className="mt-1 w-full h-8 px-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                >
                  <option value="">— Không gắn vùng —</option>
                  {shippingZones.map((z) => (
                      <option key={z.zoneCode} value={z.zoneCode}>
                        {z.zoneCode} · {z.label} ({z.etaDays.min}–{z.etaDays.max} ngày)
                      </option>
                  ))}
                </select>
                {selectedShippingZone && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      In trên hóa đơn: <span className="font-mono">{selectedShippingZone.zoneCode}</span> · giao{" "}
                      {selectedShippingZone.etaDays.min}–{selectedShippingZone.etaDays.max} ngày
                    </p>
                )}
              </div>

              {/* Shipping + VAT */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Truck className="h-3 w-3" /> Phí ship (₫)
                  </label>
                  <input type="number" min={0} value={shippingFee || ""}
                         onChange={(e) => setShippingFee(Math.max(0, +e.target.value || 0))}
                         disabled={!!lastInvoice || checkoutBusy} placeholder="0"
                         className={cn("mt-1 w-full h-8 px-2 text-sm text-right bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60",
                             shippingFee < 0 && "border-danger")} />
                  {shippingFee < 0 && <p className="text-[10px] text-danger mt-0.5">Phí ship không hợp lệ</p>}
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">VAT (%)</label>
                  <input type="number" min={0} max={100} value={vatPercent || ""}
                         onChange={(e) => setVatPercent(Math.max(0, Math.min(100, +e.target.value || 0)))}
                         disabled={!!lastInvoice || checkoutBusy} placeholder="0"
                         className={cn("mt-1 w-full h-8 px-2 text-sm text-right bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60",
                             (vatPercent < 0 || vatPercent > 100) && "border-danger")} />
                </div>
              </div>

              {/* Breakdown */}
              <div className="border-t pt-3">
                <SummaryBreakdown />
              </div>
            </div>

            {/* CTA */}
            <div className="p-3 border-t space-y-2">
              {lastInvoice ? (
                  <>
                    <button onClick={handlePrint} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover">
                      <Printer className="h-4 w-4" /> In POS58
                    </button>
                    <button onClick={handleNewInvoice} className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium border hover:bg-muted">
                      <Receipt className="h-4 w-4" /> Hóa đơn mới
                    </button>
                  </>
              ) : (
                  <>
                    <button
                        onClick={() => void handleCheckout()}
                        disabled={!!blockedCheckoutReason || checkoutBusy}
                        title={blockedCheckoutReason ?? ""}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <Check className="h-4 w-4" />
                      Tạo hóa đơn — {formatVND(totals.total)}
                    </button>
                    {blockedCheckoutReason && <p className="text-[10px] text-center text-muted-foreground">{blockedCheckoutReason}</p>}
                    <button onClick={handlePrint} disabled={lines.length === 0}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium border hover:bg-muted transition-colors disabled:opacity-50">
                      <Printer className="h-4 w-4" /> In tạm POS58
                    </button>
                  </>
              )}
            </div>
          </div>

          {/* Mobile sticky summary sheet */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t shadow-lg">
            <button onClick={() => setMobileSummaryOpen((o) => !o)} className="w-full px-3 py-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              {mobileSummaryOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="font-medium">{totalItems} SP</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-bold text-primary">{formatVND(totals.total)}</span>
            </span>
              {selectedPromotion && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", selectedPromotionBackendEligible ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
                {selectedPromotionBackendEligible ? "✓ KM" : "⚠ KM"}
              </span>
              )}
            </button>
            {mobileSummaryOpen && (
                <div className="px-3 pb-3 max-h-[60vh] overflow-y-auto space-y-3 border-t">
                  <div className="pt-3">
                    <label className="text-[11px] font-medium text-muted-foreground">Khách hàng</label>
                    <SearchableCombobox className="mt-1" value={selectedCustomer} onChange={setSelectedCustomer}
                                        disabled={!!lastInvoice} showEmptyOption emptyOptionLabel="Khách lẻ" placeholder="Tìm SĐT, tên..."
                                        options={customers.filter((c) => c.active).map((c) => ({ id: c.id, label: c.name, sub: `${c.code} · ${c.phone}` }))}
                                        onCreateNew={() => setCustomerDrawerOpen(true)} createLabel="Tạo khách hàng mới" />
                  </div>
                  <PaymentMethodPicker
                      value={paymentType}
                      onChange={setPaymentType}
                      disabled={!!lastInvoice}
                      onOpenQr={paymentType !== "cash" && totals.total > 0 ? () => setQrDialogOpen(true) : undefined}
                  />
                  <PromotionBlock />
                  {/* Shipping zone (mobile) — mirrors desktop right panel so cashiers can attach a vùng giao hàng on phones too. */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Vùng giao hàng
                    </label>
                    <select
                        value={shippingZoneCode}
                        onChange={(e) => setShippingZoneCode(e.target.value)}
                        disabled={!!lastInvoice || checkoutBusy}
                        className="mt-1 w-full h-9 px-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                    >
                      <option value="">— Không gắn vùng —</option>
                      {shippingZones.map((z) => (
                          <option key={z.zoneCode} value={z.zoneCode}>
                            {z.zoneCode} · {z.label} ({z.etaDays.min}–{z.etaDays.max} ngày)
                          </option>
                      ))}
                    </select>
                    {selectedShippingZone && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          In trên hóa đơn: <span className="font-mono">{selectedShippingZone.zoneCode}</span> · giao{" "}
                          {selectedShippingZone.etaDays.min}–{selectedShippingZone.etaDays.max} ngày
                        </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Phí ship</label>
                      <input type="number" min={0} value={shippingFee || ""} onChange={(e) => setShippingFee(Math.max(0, +e.target.value || 0))}
                             disabled={!!lastInvoice || checkoutBusy}
                             className="mt-1 w-full h-8 px-2 text-sm text-right bg-background border rounded-md disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">VAT (%)</label>
                      <input type="number" min={0} max={100} value={vatPercent || ""} onChange={(e) => setVatPercent(Math.max(0, Math.min(100, +e.target.value || 0)))}
                             disabled={!!lastInvoice || checkoutBusy}
                             className="mt-1 w-full h-8 px-2 text-sm text-right bg-background border rounded-md disabled:opacity-60" />
                    </div>
                  </div>
                  <SummaryBreakdown />
                </div>
            )}
            <div className="p-2 border-t">
              {lastInvoice ? (
                  <button onClick={handleNewInvoice} className="w-full py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground">Hóa đơn mới</button>
              ) : (
                  <button
                      onClick={() => void handleCheckout()}
                      disabled={!!blockedCheckoutReason || checkoutBusy}
                      className="w-full py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed">
                    {blockedCheckoutReason ?? `Tạo hóa đơn — ${formatVND(totals.total)}`}
                  </button>
              )}
            </div>
          </div>
        </div>

        {(lines.length > 0 || lastInvoice) && (
            <Printable58Invoice invoice={pos58Invoice} lines={pos58Lines} />
        )}
        <CustomerFormDrawer
            open={customerDrawerOpen}
            onClose={() => setCustomerDrawerOpen(false)}
            onSave={async (input) => { await adminCustomers.save(input); reloadCustomers(); }}
        />
        {paymentType !== "cash" && (
            <PosQrDialog
                open={qrDialogOpen}
                onOpenChange={setQrDialogOpen}
                amount={totals.total}
                paymentType={paymentType as PosQrPaymentType}
                reference={lastInvoice?.number}
            />
        )}
      </>
  );
}

function Row({ label, value, muted, className }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
      <div className={cn("flex justify-between", className)}>
        <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
  );
}

const PAYMENT_METHODS: { value: Invoice["paymentType"]; label: string; icon: typeof Banknote }[] = [
  { value: "cash", label: "Tiền mặt", icon: Banknote },
  { value: "transfer", label: "Chuyển khoản", icon: Landmark },
  { value: "momo", label: "MoMo", icon: Wallet },
  { value: "zalopay", label: "ZaloPay", icon: CreditCard },
];

function PaymentMethodPicker({
                               value,
                               onChange,
                               disabled,
                               onOpenQr,
                             }: {
  value: Invoice["paymentType"];
  onChange: (v: Invoice["paymentType"]) => void;
  disabled?: boolean;
  /** When set, renders a "Mở QR khách quét" action below the picker. */
  onOpenQr?: () => void;
}) {
  const activeMeta = PAYMENT_METHODS.find((m) => m.value === value);
  return (
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">Phương thức thanh toán</label>
          {activeMeta && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            {activeMeta.label}
          </span>
          )}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const Icon = m.icon;
            const active = value === m.value;
            return (
                <button
                    key={m.value}
                    type="button"
                    onClick={() => onChange(m.value)}
                    disabled={disabled}
                    className={cn(
                        "flex items-center justify-center gap-1.5 h-9 px-2 text-xs font-medium rounded-md border transition-colors",
                        "disabled:opacity-60 disabled:cursor-not-allowed",
                        active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-border hover:bg-muted",
                    )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.label}
                </button>
            );
          })}
        </div>
        {onOpenQr && (
            <button
                type="button"
                onClick={onOpenQr}
                className="mt-1.5 w-full h-8 px-2 text-xs font-medium rounded-md border border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
            >
              <ScanLine className="h-3.5 w-3.5" />
              Mở QR cho khách quét
            </button>
        )}
      </div>
  );
}
