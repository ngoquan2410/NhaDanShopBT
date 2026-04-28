/**
 * Slice 6C: storefront checkout must obtain commercial totals from `postSalesQuote`
 * (including voucherCode); do not submit pending orders from FE-only pricing snapshots.
 */
export function storefrontRequiresBackendQuoteForCheckout(): boolean {
  return true;
}
