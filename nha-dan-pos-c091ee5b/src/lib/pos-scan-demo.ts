/**
 * Legacy demo helpers — not used by admin POS (backend `GET /api/pos/scan/{code}` only).
 * Production POS must use `/api/pos/scan/{code}`.
 */
import { products } from "@/lib/mock-data";
import { normalizeScanCode } from "@/lib/scan-code";

export type ResolvedScan = {
  product: (typeof products)[0];
  variant: (typeof products)[0]["variants"][0];
};

export function resolveScannedCode(rawCode: string): ResolvedScan | null {
  const code = normalizeScanCode(rawCode).toLowerCase();
  if (!code) return null;

  for (const p of products) {
    const v = p.variants.find((x) => x.code.toLowerCase() === code);
    if (v) return { product: p, variant: v };
  }

  const prod = products.find((p) => p.code.toLowerCase() === code);
  if (prod) {
    const v = prod.variants.find((x) => x.isDefault) || prod.variants[0];
    if (v) return { product: prod, variant: v };
  }

  return null;
}
