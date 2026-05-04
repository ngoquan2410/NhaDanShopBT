/**
 * Pure resolver so Vitest can assert admin invoice adapter selection without
 * relying on Vite compile-time env inlining quirks.
 */
export function shouldUseLocalInvoiceAdapterForAdmin(env: {
  MODE?: string;
  VITE_ADMIN_INVOICE_LOCAL_DEMO?: string | boolean;
}): boolean {
  const mode = env.MODE ?? "";
  const demo = env.VITE_ADMIN_INVOICE_LOCAL_DEMO;
  const demoOn = demo === "true" || demo === true;
  return mode === "test" || demoOn;
}
