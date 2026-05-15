import type { CartItem } from "@/lib/cart";
import type { StorefrontVariant } from "@/services/catalog/publicCatalog";

export type StorefrontAvailabilityTone = "ok" | "warn" | "out";

/** Backend-owned `availableQty` + `availabilityStatus`; never infer from raw stock fields. */
export function storefrontVariantOutOfStock(v: StorefrontVariant): boolean {
  if (v.available === false || v.isSellable === false) return true;
  if (v.availabilityStatus === "OUT_OF_STOCK") return true;
  if (typeof v.availableQty === "number") return v.availableQty <= 0;
  return false;
}

export function storefrontAvailabilityLine(v: StorefrontVariant): { text: string; tone: StorefrontAvailabilityTone } {
  if (storefrontVariantOutOfStock(v)) {
    return { text: "Hết hàng", tone: "out" };
  }
  if (typeof v.availableQty === "number" && v.availableQty > 0) {
    const tone = v.availabilityStatus === "LOW_STOCK" ? "warn" : "ok";
    return { text: `Còn ${v.availableQty} ${v.sellUnit}`, tone };
  }
  return { text: "Còn hàng", tone: "ok" };
}

/** Semantic text color for storefront availability (shared hero / cards / detail). */
export function storefrontAvailabilityTextClass(tone: StorefrontAvailabilityTone): string {
  switch (tone) {
    case "out":
      return "text-danger font-medium";
    case "warn":
      return "text-warning font-medium";
    case "ok":
    default:
      return "text-success font-medium";
  }
}

/** Label + tone + shared Tailwind class for availability line. */
export function storefrontAvailabilityUi(v: StorefrontVariant) {
  const line = storefrontAvailabilityLine(v);
  return {
    text: line.text,
    tone: line.tone,
    textClassName: storefrontAvailabilityTextClass(line.tone),
  };
}

/** Map a persisted cart line to the same shape used by storefront availability copy/colors. */
export function storefrontVariantFromCartItem(
  item: Pick<CartItem, "variantId" | "variantCode" | "variantName" | "sellUnit" | "unitPrice" | "availableQty" | "availabilityStatus">,
): StorefrontVariant {
  const q =
    typeof item.availableQty === "number" && Number.isFinite(item.availableQty) && item.availableQty >= 0
      ? Math.floor(item.availableQty)
      : undefined;
  return {
    id: item.variantId,
    code: item.variantCode ?? String(item.variantId),
    name: item.variantName ?? "",
    sellUnit: item.sellUnit ?? "cái",
    sellPrice: item.unitPrice,
    ...(q !== undefined ? { availableQty: q } : {}),
    ...(item.availabilityStatus
      ? { availabilityStatus: item.availabilityStatus as StorefrontVariant["availabilityStatus"] }
      : {}),
  };
}
