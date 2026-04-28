import { adminFetchJson } from "@/services/auth/adminApi";

/** Mirrors backend {@code com.example.nhadanshop.dto.PosScanResponse} (camelCase JSON). */
export interface PosScanDto {
  kind: string;
  productId: number | null;
  productName: string | null;
  productActive: boolean;
  variantId: number | null;
  variantCode: string | null;
  variantName: string | null;
  variantActive: boolean;
  variantSellable: boolean;
  price: string | number;
  batchId: number | null;
  batchCode: string | null;
  expiryDate: string | null;
  remainingQty: number | null;
  batchStatus: string | null;
  batchActiveForSale: boolean;
  sellable: boolean | null;
  blockReason: string | null;
}

function scanPath(code: string): string {
  const trimmed = (code || "").trim();
  const enc = encodeURIComponent(trimmed);
  return `/api/pos/scan/${enc}`;
}

export async function fetchPosScan(code: string): Promise<PosScanDto> {
  return adminFetchJson<PosScanDto>(scanPath(code));
}
