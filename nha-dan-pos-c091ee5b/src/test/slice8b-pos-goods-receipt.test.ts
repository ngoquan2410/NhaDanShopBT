import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

describe("Slice 8B POS + goods receipt sources", () => {
  it("POS does not static-import mock scan or sync catch fallback", () => {
    const pos = readFileSync(resolve(ROOT, "pages/admin/POS.tsx"), "utf8");
    expect(pos).not.toMatch(/from ["']@\/lib\/mock-data["']/);
    expect(pos).not.toMatch(/from ["']@\/lib\/pos-scan["']/);
    expect(pos).not.toMatch(/pos-scan-demo/);
    expect(pos).not.toMatch(/resolveScannedCode/);
    expect(pos).toMatch(/fetchPosScan\(/);
    expect(pos).toMatch(/addVariantLineFromBackendScan/);
  });

  it("GoodsReceiptDetailDrawer does not import mock product catalog", () => {
    const gr = readFileSync(resolve(ROOT, "components/shared/GoodsReceiptDetailDrawer.tsx"), "utf8");
    expect(gr).not.toMatch(/mock-data/);
    expect(gr).toMatch(/variantSellPrice/);
  });

  it("pos-print-types exists for thermal invoice without mock-data", () => {
    const p = readFileSync(resolve(ROOT, "lib/pos-print-types.ts"), "utf8");
    expect(p).not.toMatch(/mock-data/);
    expect(p).toMatch(/export interface Invoice/);
  });
});
