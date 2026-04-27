import { products } from "@/lib/mock-data";

export type ResolvedScan = {
  product: typeof products[0];
  variant: typeof products[0]["variants"][0];
};

/**
 * Normalize a scanned/typed code: trim + strip control chars.
 * HID scanners may append \r\n or stray whitespace.
 */
export function normalizeScanCode(raw: string): string {
  return (raw || "").replace(/[\r\n\t]/g, "").trim();
}

/**
 * Single resolution pipeline used by HID, Camera and Manual modes.
 * Future BE integration: replace this body with an API lookup,
 * keep the same input/output shape — UI does not need to change.
 *
 * Resolution order:
 *  1. exact variant barcode (case-insensitive)
 *  2. variant code
 *  3. product code (returns the default variant)
 */
export function resolveScannedCode(rawCode: string): ResolvedScan | null {
  const code = normalizeScanCode(rawCode).toLowerCase();
  if (!code) return null;

  // 1 + 2: variant-level match (treat code as both barcode and variant code)
  for (const p of products) {
    const v = p.variants.find((x) => x.code.toLowerCase() === code);
    if (v) return { product: p, variant: v };
  }

  // 3: product code → default variant
  const prod = products.find((p) => p.code.toLowerCase() === code);
  if (prod) {
    const v = prod.variants.find((x) => x.isDefault) || prod.variants[0];
    if (v) return { product: prod, variant: v };
  }

  return null;
}
