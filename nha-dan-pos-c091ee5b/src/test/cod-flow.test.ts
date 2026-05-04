/**
 * Deprecated: previously exercised COD using fake catalog IDs (`productId: "1"`, `variantId: "v1"`)
 * through local store-backed services — no longer acceptable as integration truth.
 *
 * Real COD / quote → pending → invoice coverage:
 * - Backend MockMvc: `Slice8BMvcIntegrationTest#http_storefront_quote_pending_confirm_invoice_totals_match_quote_snapshot`
 * - PostgreSQL + Vite + Selenium: `RUN_AUTOMATION=1 npm run test:automation` → `automation/selenium/run-selenium.mjs`
 *   (extend with login + full storefront/admin flows as needed).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cod-flow — replaced by backend-seeded automation (no mock catalog IDs)", () => {
  it("documents Selenium automation runner on disk", () => {
    expect(existsSync(resolve(process.cwd(), "automation/selenium/run-selenium.mjs"))).toBe(true);
  });
});
