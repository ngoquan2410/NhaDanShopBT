// Promotions: discriminated-union data model, validation, summary formatter,
// and a POS-ready application contract. Designed so future BE integration only
// needs to swap the data source (storage), not redesign the UI or rules.

import { formatVND } from "./format";

// ===== Shared =====
export type PromotionScope =
  | { kind: "all" }
  | { kind: "categories"; categoryIds: string[] }
  | { kind: "products"; productIds: string[] };

export interface PromotionBase {
  id: string;
  name: string;
  description: string;
  active: boolean;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  scope: PromotionScope;
}

// ===== Type-specific configs =====
export interface PercentPromotion extends PromotionBase {
  type: "percent";
  percent: number;          // 1..100
  maxDiscount?: number;     // optional cap (VND)
  minOrder?: number;
}

export interface FixedPromotion extends PromotionBase {
  type: "fixed";
  amount: number;           // VND
  minOrder?: number;
}

export interface BuyItemRef {
  productId: string;
  productName: string;
  quantity: number;
}
export interface GetItemRef {
  productId: string;
  productName: string;
  quantity: number;
}
export interface BuyXGetYPromotion extends PromotionBase {
  type: "buy-x-get-y";
  buyItems: BuyItemRef[];
  getItems: GetItemRef[];
  mode: "same" | "different";
  repeatable: boolean;
}

export interface GiftItemRef {
  productId: string;
  productName: string;
  quantity: number;
}
export type GiftTriggerType = "min-order" | "buy-product" | "buy-quantity";
export interface GiftPromotion extends PromotionBase {
  type: "gift";
  triggerType: GiftTriggerType;
  triggerValue: number;     // amount (min-order) or qty (buy-quantity)
  triggerProductId?: string;// for buy-product / buy-quantity
  triggerProductName?: string;
  giftItems: GiftItemRef[];
  giftStockLimit?: number;
}

export interface FreeShippingPromotion extends PromotionBase {
  type: "free-shipping";
  minOrder?: number;
  maxShippingDiscount?: number;
}

export type Promotion =
  | PercentPromotion
  | FixedPromotion
  | BuyXGetYPromotion
  | GiftPromotion
  | FreeShippingPromotion;

export type PromotionType = Promotion["type"];

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  percent: "% giảm giá",
  fixed: "Giảm cố định",
  "buy-x-get-y": "Mua X tặng Y",
  gift: "Quà tặng",
  "free-shipping": "Miễn phí ship",
};

// ===== Defaults =====
export function makeEmptyPromotion(type: PromotionType): Promotion {
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const base = {
    id: "",
    name: "",
    description: "",
    active: true,
    startDate: today,
    endDate: next,
    scope: { kind: "all" } as PromotionScope,
  };
  switch (type) {
    case "percent":
      return { ...base, type: "percent", percent: 10 };
    case "fixed":
      return { ...base, type: "fixed", amount: 10000 };
    case "buy-x-get-y":
      return { ...base, type: "buy-x-get-y", buyItems: [], getItems: [], mode: "same", repeatable: true };
    case "gift":
      return { ...base, type: "gift", triggerType: "min-order", triggerValue: 0, giftItems: [] };
    case "free-shipping":
      return { ...base, type: "free-shipping" };
  }
}

// Migrate a legacy/loose record into the new union.
export function migratePromotion(raw: any): Promotion {
  const base: PromotionBase = {
    id: raw.id ?? "",
    name: raw.name ?? "",
    description: raw.description ?? "",
    active: raw.active ?? true,
    startDate: raw.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: raw.endDate ?? new Date().toISOString().slice(0, 10),
    scope:
      raw.scope?.kind ? raw.scope :
      raw.scope === "categories" ? { kind: "categories", categoryIds: raw.scopeIds ?? [] } :
      raw.scope === "products" ? { kind: "products", productIds: raw.scopeIds ?? [] } :
      { kind: "all" },
  };
  switch (raw.type) {
    case "fixed":
      return { ...base, type: "fixed", amount: Number(raw.discountValue) || Number(raw.amount) || 0, minOrder: Number(raw.minOrderValue) || undefined };
    case "buy-x-get-y":
      return { ...base, type: "buy-x-get-y", buyItems: raw.buyItems ?? [], getItems: raw.getItems ?? [], mode: raw.mode ?? "same", repeatable: raw.repeatable ?? true };
    case "gift":
      return {
        ...base,
        type: "gift",
        triggerType: raw.triggerType ?? "min-order",
        triggerValue: Number(raw.triggerValue) || Number(raw.minOrderValue) || 0,
        triggerProductId: raw.triggerProductId,
        triggerProductName: raw.triggerProductName,
        giftItems: raw.giftItems ?? [],
        giftStockLimit: raw.giftStockLimit,
      };
    case "free-shipping":
      return { ...base, type: "free-shipping", minOrder: Number(raw.minOrderValue) || undefined, maxShippingDiscount: Number(raw.maxDiscount) || undefined };
    case "percent":
    default:
      return {
        ...base,
        type: "percent",
        percent: Number(raw.discountValue) || Number(raw.percent) || 0,
        maxDiscount: Number(raw.maxDiscount) || undefined,
        minOrder: Number(raw.minOrderValue) || undefined,
      };
  }
}

// ===== Validation =====
export interface ValidationResult {
  errors: Record<string, string>;   // block save
  warnings: Record<string, string>; // do not block save
}

export function validatePromotion(p: Promotion): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  if (!p.name.trim()) errors.name = "Vui lòng nhập tên khuyến mãi";
  if (!p.startDate) errors.startDate = "Bắt buộc nhập ngày bắt đầu";
  if (!p.endDate) errors.endDate = "Bắt buộc nhập ngày kết thúc";
  if (p.startDate && p.endDate && p.endDate < p.startDate) {
    errors.endDate = "Ngày kết thúc phải sau ngày bắt đầu";
  }

  if (p.scope.kind === "categories" && p.scope.categoryIds.length === 0) {
    errors.scope = "Vui lòng chọn ít nhất 1 danh mục";
  }
  if (p.scope.kind === "products" && p.scope.productIds.length === 0) {
    errors.scope = "Vui lòng chọn ít nhất 1 sản phẩm";
  }

  switch (p.type) {
    case "percent":
      if (!(p.percent >= 1 && p.percent <= 100)) errors.percent = "Phần trăm phải từ 1 đến 100";
      if (p.maxDiscount != null && p.maxDiscount < 0) errors.maxDiscount = "Giảm tối đa không được âm";
      if (p.minOrder != null && p.minOrder < 0) errors.minOrder = "Đơn tối thiểu không được âm";
      break;
    case "fixed":
      if (!(p.amount > 0)) errors.amount = "Số tiền giảm phải lớn hơn 0";
      if (p.minOrder != null && p.minOrder < 0) errors.minOrder = "Đơn tối thiểu không được âm";
      if (p.minOrder != null && p.minOrder > 0 && p.amount > p.minOrder) {
        warnings.amount = "Số tiền giảm lớn hơn đơn tối thiểu — đơn hàng có thể về 0";
      }
      break;
    case "buy-x-get-y":
      if (p.buyItems.length === 0) errors.buyItems = "Cần ít nhất 1 sản phẩm điều kiện";
      if (p.getItems.length === 0) errors.getItems = "Cần ít nhất 1 sản phẩm tặng";
      if (p.buyItems.some((b) => !(b.quantity > 0))) errors.buyItems = "Số lượng mua phải lớn hơn 0";
      if (p.getItems.some((g) => !(g.quantity > 0))) errors.getItems = "Số lượng tặng phải lớn hơn 0";
      break;
    case "gift":
      if (p.triggerType !== "buy-product" && !(p.triggerValue > 0)) {
        errors.triggerValue = "Giá trị kích hoạt phải lớn hơn 0";
      }
      if ((p.triggerType === "buy-product" || p.triggerType === "buy-quantity") && !p.triggerProductId) {
        errors.triggerProductId = "Vui lòng chọn sản phẩm kích hoạt";
      }
      if (p.giftItems.length === 0) errors.giftItems = "Cần ít nhất 1 sản phẩm quà";
      if (p.giftItems.some((g) => !(g.quantity > 0))) errors.giftItems = "Số lượng quà phải lớn hơn 0";
      if (p.giftStockLimit != null && p.giftStockLimit < 0) errors.giftStockLimit = "Tồn kho quà không được âm";
      break;
    case "free-shipping":
      if (p.minOrder != null && p.minOrder < 0) errors.minOrder = "Đơn tối thiểu không được âm";
      if (p.maxShippingDiscount != null && p.maxShippingDiscount < 0) errors.maxShippingDiscount = "Mức ship tối đa không được âm";
      break;
  }

  return { errors, warnings };
}

// ===== Summary =====
export function formatPromotionSummary(p: Promotion): string {
  switch (p.type) {
    case "percent": {
      const cap = p.maxDiscount && p.maxDiscount > 0 ? ` tối đa ${formatVND(p.maxDiscount)}` : "";
      const min = p.minOrder && p.minOrder > 0 ? ` cho đơn từ ${formatVND(p.minOrder)}` : "";
      return `Giảm ${p.percent}%${cap}${min}`;
    }
    case "fixed": {
      const min = p.minOrder && p.minOrder > 0 ? ` cho đơn từ ${formatVND(p.minOrder)}` : "";
      return `Giảm ${formatVND(p.amount)}${min}`;
    }
    case "buy-x-get-y": {
      const buy = p.buyItems.map((b) => `${b.quantity} ${b.productName}`).join(" + ") || "?";
      const get = p.getItems.map((g) => `${g.quantity} ${g.productName}`).join(" + ") || "?";
      const rep = p.repeatable ? " (lặp theo bội số)" : "";
      return `Mua ${buy} tặng ${get}${rep}`;
    }
    case "gift": {
      const gifts = p.giftItems.map((g) => `${g.quantity} ${g.productName}`).join(" + ") || "?";
      let trigger = "";
      if (p.triggerType === "min-order") trigger = `Đơn từ ${formatVND(p.triggerValue)}`;
      else if (p.triggerType === "buy-product") trigger = `Mua ${p.triggerProductName ?? "?"}`;
      else trigger = `Mua ${p.triggerValue} ${p.triggerProductName ?? "?"}`;
      const limit = p.giftStockLimit ? ` (còn ${p.giftStockLimit} quà)` : "";
      return `${trigger} tặng ${gifts}${limit}`;
    }
    case "free-shipping": {
      const min = p.minOrder && p.minOrder > 0 ? ` cho đơn từ ${formatVND(p.minOrder)}` : "";
      const cap = p.maxShippingDiscount && p.maxShippingDiscount > 0 ? ` (giảm tối đa ${formatVND(p.maxShippingDiscount)})` : "";
      return `Miễn phí ship${min}${cap}`;
    }
  }
}

export function formatScope(p: Promotion, opts?: { categoryNames?: Record<string, string>; productNames?: Record<string, string> }): string {
  const s = p.scope;
  if (s.kind === "all") return "Toàn bộ sản phẩm";
  if (s.kind === "categories") {
    const names = (opts?.categoryNames && s.categoryIds.map((id) => opts.categoryNames![id]).filter(Boolean)) || [];
    return names.length ? `Danh mục: ${names.join(", ")}` : `Danh mục (${s.categoryIds.length})`;
  }
  const names = (opts?.productNames && s.productIds.map((id) => opts.productNames![id]).filter(Boolean)) || [];
  return names.length ? `Sản phẩm: ${names.join(", ")}` : `Sản phẩm (${s.productIds.length})`;
}

// ===== POS application contract =====
// Minimal cart shape so this stays decoupled from the POS implementation.
export interface CartLine {
  productId: string;
  variantId?: string;
  productName: string;
  unitPrice: number;
  quantity: number;
}
export interface Cart {
  lines: CartLine[];
  subtotal: number;
  shippingFee?: number;
  customerCategoryIds?: string[]; // for scope check (optional)
}

export interface PromotionApplication {
  promotionId: string;
  promotionName: string;
  type: PromotionType;
  status: "eligible" | "ineligible" | "unavailable";
  discount: number;          // amount off subtotal (VND)
  shippingDiscount: number;  // amount off shipping
  freeItems: { productId: string; productName: string; quantity: number }[];
  reason: string;            // human-readable
  applied: boolean;
  skipReason?: string;
}

function isWithinDate(p: Promotion, now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return p.active && today >= p.startDate && today <= p.endDate;
}

function scopedSubtotal(cart: Cart, p: Promotion, productCategory?: Record<string, string>): number {
  if (p.scope.kind === "all") return cart.subtotal;
  if (p.scope.kind === "products") {
    const ids = new Set(p.scope.productIds);
    return cart.lines.filter((l) => ids.has(l.productId)).reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  }
  // categories
  if (!productCategory) return 0;
  const ids = new Set(p.scope.categoryIds);
  return cart.lines.filter((l) => ids.has(productCategory[l.productId])).reduce((s, l) => s + l.unitPrice * l.quantity, 0);
}

function hasCartItems(cart: Cart): boolean {
  return cart.lines.some((line) => line.quantity > 0);
}

function hasScopedItems(cart: Cart, p: Promotion, productCategory?: Record<string, string>): boolean {
  if (p.scope.kind === "all") return hasCartItems(cart);
  if (p.scope.kind === "products") {
    const ids = new Set(p.scope.productIds);
    return cart.lines.some((line) => ids.has(line.productId) && line.quantity > 0);
  }
  if (!productCategory) return false;
  const ids = new Set(p.scope.categoryIds);
  return cart.lines.some((line) => ids.has(productCategory[line.productId]) && line.quantity > 0);
}

function scopeMismatchReason(p: Promotion): string {
  return p.scope.kind === "all" ? "Chưa có sản phẩm áp dụng" : "Không đúng phạm vi áp dụng";
}

export function applyPromotionToCart(
  cart: Cart,
  p: Promotion,
  ctx?: { productCategory?: Record<string, string> }
): PromotionApplication {
  const skip = (reason: string, status: PromotionApplication["status"] = "ineligible"): PromotionApplication => ({
    promotionId: p.id, promotionName: p.name, type: p.type, status,
    discount: 0, shippingDiscount: 0, freeItems: [], reason: formatPromotionSummary(p),
    applied: false, skipReason: reason,
  });

  if (!isWithinDate(p)) return skip("Ngoài thời gian áp dụng", "unavailable");

  const eligibleSubtotal = scopedSubtotal(cart, p, ctx?.productCategory);
  const cartHasItems = hasCartItems(cart);
  const matchesScope = hasScopedItems(cart, p, ctx?.productCategory);

  switch (p.type) {
    case "percent": {
      if (!cartHasItems) return skip(p.minOrder && p.minOrder > 0 ? "Chưa đạt đơn tối thiểu" : scopeMismatchReason(p));
      if (!matchesScope || eligibleSubtotal <= 0) return skip(scopeMismatchReason(p));
      if (p.minOrder && cart.subtotal < p.minOrder) return skip("Chưa đạt đơn tối thiểu");
      let discount = Math.floor((eligibleSubtotal * p.percent) / 100);
      if (p.maxDiscount && p.maxDiscount > 0) discount = Math.min(discount, p.maxDiscount);
      if (discount <= 0) return skip("Chưa có giá trị giảm hợp lệ");
      return { ...skip("", "eligible"), discount, shippingDiscount: 0, applied: true, skipReason: undefined };
    }
    case "fixed": {
      if (!cartHasItems) return skip(p.minOrder && p.minOrder > 0 ? "Chưa đạt đơn tối thiểu" : scopeMismatchReason(p));
      if (!matchesScope || eligibleSubtotal <= 0) return skip(scopeMismatchReason(p));
      if (p.minOrder && cart.subtotal < p.minOrder) return skip("Chưa đạt đơn tối thiểu");
      const discount = Math.min(p.amount, eligibleSubtotal);
      if (discount <= 0) return skip("Chưa có giá trị giảm hợp lệ");
      return { ...skip("", "eligible"), discount, shippingDiscount: 0, applied: true, skipReason: undefined };
    }
    case "free-shipping": {
      if (p.minOrder && cart.subtotal < p.minOrder) return skip("Chưa đạt đơn tối thiểu");
      const ship = cart.shippingFee ?? 0;
      if (ship <= 0) return skip("Chưa có phí ship để áp dụng");
      const cap = p.maxShippingDiscount ?? ship;
      const shippingDiscount = Math.min(ship, cap);
      if (shippingDiscount <= 0) return skip("Chưa có phí ship để áp dụng");
      return { ...skip("", "eligible"), shippingDiscount, applied: true, skipReason: undefined };
    }
    case "buy-x-get-y": {
      if (p.buyItems.length === 0 || p.getItems.length === 0) return skip("Khuyến mãi cấu hình chưa đầy đủ", "unavailable");
      // Count how many "sets" of buyItems exist in the cart.
      const qtyOf = (id: string) => cart.lines.filter((l) => l.productId === id).reduce((s, l) => s + l.quantity, 0);
      const sets = Math.min(...p.buyItems.map((b) => Math.floor(qtyOf(b.productId) / b.quantity)));
      const times = p.repeatable ? sets : sets > 0 ? 1 : 0;
      if (times <= 0) return skip("Chưa đủ số lượng sản phẩm điều kiện");
      const freeItems = p.getItems.map((g) => ({ productId: g.productId, productName: g.productName, quantity: g.quantity * times }));
      return { ...skip("", "eligible"), freeItems, applied: true, skipReason: undefined };
    }
    case "gift": {
      if (p.giftItems.length === 0) return skip("Khuyến mãi cấu hình chưa đầy đủ", "unavailable");
      let triggered = false;
      if (p.triggerType === "min-order") triggered = cart.subtotal >= p.triggerValue;
      else if (p.triggerType === "buy-product") {
        if (!p.triggerProductId) return skip("Khuyến mãi cấu hình chưa đầy đủ", "unavailable");
        triggered = !!cart.lines.find((l) => l.productId === p.triggerProductId && l.quantity > 0);
      }
      else if (p.triggerType === "buy-quantity") {
        if (!p.triggerProductId) return skip("Khuyến mãi cấu hình chưa đầy đủ", "unavailable");
        const qty = cart.lines.filter((l) => l.productId === p.triggerProductId).reduce((s, l) => s + l.quantity, 0);
        triggered = qty >= p.triggerValue;
      }
      if (!triggered) {
        if (p.triggerType === "min-order") return skip("Chưa đạt đơn tối thiểu");
        if (p.triggerType === "buy-product") return skip("Chưa có sản phẩm điều kiện");
        return skip("Chưa đủ số lượng sản phẩm điều kiện");
      }
      const freeItems = p.giftItems.map((g) => ({ productId: g.productId, productName: g.productName, quantity: g.quantity }));
      return { ...skip("", "eligible"), freeItems, applied: true, skipReason: undefined };
    }
  }
}

// ===== Progress hint =====
// Computes how close the cart is to qualifying for a given promotion.
// Returns null if the promotion is already eligible OR if progress is not meaningful
// (e.g. unavailable / outside date / scope mismatch with no clear numeric target).
export interface PromotionProgress {
  /** 0..1 ratio toward eligibility */
  ratio: number;
  /** Short human-readable message, e.g. "Cần thêm 75.000đ để đạt khuyến mãi Giảm 10%" */
  message: string;
  /** Optional numeric current/target for callers that want to render their own bar */
  current?: number;
  target?: number;
  unit?: "vnd" | "qty";
}

export function getPromotionProgress(
  cart: Cart,
  p: Promotion,
  ctx?: { productCategory?: Record<string, string> }
): PromotionProgress | null {
  if (!isWithinDate(p)) return null;

  const scopedSub = scopedSubtotal(cart, p, ctx?.productCategory);
  const subtotal = cart.subtotal;
  const ratio = (cur: number, tgt: number) => (tgt <= 0 ? 1 : Math.max(0, Math.min(1, cur / tgt)));

  switch (p.type) {
    case "percent":
    case "fixed": {
      const min = p.minOrder ?? 0;
      if (min > 0 && subtotal < min) {
        const remain = min - subtotal;
        return {
          ratio: ratio(subtotal, min),
          current: subtotal,
          target: min,
          unit: "vnd",
          message: `Cần thêm ${formatVND(remain)} để đạt khuyến mãi "${p.name}"`,
        };
      }
      if (scopedSub <= 0 && p.scope.kind !== "all") {
        return { ratio: 0, message: `Thêm sản phẩm thuộc phạm vi của "${p.name}" để áp dụng` };
      }
      return null;
    }
    case "free-shipping": {
      const min = p.minOrder ?? 0;
      const ship = cart.shippingFee ?? 0;
      if (min > 0 && subtotal < min) {
        const remain = min - subtotal;
        return {
          ratio: ratio(subtotal, min),
          current: subtotal,
          target: min,
          unit: "vnd",
          message: `Cần thêm ${formatVND(remain)} để miễn phí ship`,
        };
      }
      if (ship <= 0) return { ratio: 0, message: "Thêm phí ship để áp dụng ưu đãi miễn phí ship" };
      return null;
    }
    case "buy-x-get-y": {
      if (p.buyItems.length === 0) return null;
      const qtyOf = (id: string) => cart.lines.filter((l) => l.productId === id).reduce((s, l) => s + l.quantity, 0);
      // Find the buyItem furthest from being satisfied
      const gaps = p.buyItems.map((b) => {
        const have = qtyOf(b.productId);
        return { name: b.productName, need: b.quantity, have, missing: Math.max(0, b.quantity - have) };
      });
      const worst = gaps.reduce((a, b) => (b.missing > a.missing ? b : a), gaps[0]);
      if (worst.missing <= 0) return null;
      const totalNeed = gaps.reduce((s, g) => s + g.need, 0);
      const totalHave = gaps.reduce((s, g) => s + Math.min(g.have, g.need), 0);
      return {
        ratio: ratio(totalHave, totalNeed),
        current: totalHave,
        target: totalNeed,
        unit: "qty",
        message: `Cần thêm ${worst.missing} ${worst.name} để đạt khuyến mãi "${p.name}"`,
      };
    }
    case "gift": {
      if (p.triggerType === "min-order") {
        if (subtotal >= p.triggerValue) return null;
        const remain = p.triggerValue - subtotal;
        return {
          ratio: ratio(subtotal, p.triggerValue),
          current: subtotal,
          target: p.triggerValue,
          unit: "vnd",
          message: `Cần thêm ${formatVND(remain)} để nhận quà từ "${p.name}"`,
        };
      }
      if (p.triggerType === "buy-product") {
        if (!p.triggerProductId) return null;
        const have = cart.lines.find((l) => l.productId === p.triggerProductId && l.quantity > 0);
        if (have) return null;
        return { ratio: 0, message: `Thêm ${p.triggerProductName ?? "sản phẩm điều kiện"} để nhận quà` };
      }
      if (p.triggerType === "buy-quantity") {
        if (!p.triggerProductId) return null;
        const qty = cart.lines.filter((l) => l.productId === p.triggerProductId).reduce((s, l) => s + l.quantity, 0);
        if (qty >= p.triggerValue) return null;
        const remain = p.triggerValue - qty;
        return {
          ratio: ratio(qty, p.triggerValue),
          current: qty,
          target: p.triggerValue,
          unit: "qty",
          message: `Cần thêm ${remain} ${p.triggerProductName ?? "sản phẩm điều kiện"} để nhận quà`,
        };
      }
      return null;
    }
  }
}
