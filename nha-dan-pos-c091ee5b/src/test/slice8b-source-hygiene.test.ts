import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, ...rel.split("/")), "utf8");
}

describe("Slice8B honesty — báo cáo & storefront combo", () => {
  it("POS không có mock scan / resolveScannedCode", () => {
    const t = read("pages/admin/POS.tsx");
    expect(t).not.toMatch(/pos-scan-demo/);
    expect(t).not.toMatch(/resolveScannedCode/);
  });

  it("ProfitReport không ước lượng COGS 72%", () => {
    const t = read("pages/admin/ProfitReport.tsx");
    expect(t).not.toMatch(/0\.72/);
    expect(t).not.toMatch(/revenue\s*\*\s*0\.72/);
  });

  it("RevenueReport không scale theo tỷ trọng khi filter", () => {
    const t = read("pages/admin/RevenueReport.tsx");
    expect(t).not.toContain("totalSel / totalAll");
    expect(t).not.toMatch(/\*\s*scale\b/);
    expect(t).not.toMatch(/\bscale\s*\*\s*r\./);
  });

  it("RevenueReport category filter includes inactive admin-visible categories", () => {
    const t = read("pages/admin/RevenueReport.tsx");
    expect(t).toContain("categoryService.list({ includeInactive: true })");
    expect(t).not.toContain("categoryService.list({ active: true");
    expect(t).toContain("ngưng hoạt động");
  });

  it("GoodsReceiptCreate không có nhánh offline/success PN giả sau khi bỏ JWT", () => {
    const t = read("pages/admin/GoodsReceiptCreate.tsx");
    expect(t).not.toMatch(/\boffline\b/i);
    expect(t).not.toContain("toast.success(`Đã lưu phiếu nhập ${number}");
    expect(t).toContain("JWT hết hạn");
  });

  it("Storefront combos thêm vào giỏ qua cartActions (backend combo)", () => {
    const t = read("pages/storefront/Combos.tsx");
    expect(t).toContain("cartActions.add");
    expect(t).toMatch(/toast\.(success|error)/);
  });

  it("automation runner documents RUN_AUTOMATION / RUN_FE_BE_E2E (no silent SKIP)", () => {
    const gate = readFileSync(resolve(process.cwd(), "automation", "selenium", "run-selenium.mjs"), "utf8");
    expect(gate).toMatch(/RUN_AUTOMATION|RUN_FE_BE_E2E/);
    // Exit code must reflect failures (and skipped specs in full/regression), not a bare success exit.
    expect(gate).toMatch(/process\.exit\s*\(\s*summary\.failed/);
  });
});
