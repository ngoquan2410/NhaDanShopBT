import { describe, expect, it } from "vitest";
import { buildVoucherUpsertBody, parseAdminVoucherRow, toLocalDateInput } from "./adminVouchersApi";

describe("adminVouchersApi", () => {
  it("parseAdminVoucherRow maps freeShipping and rule fields from backend DTO", () => {
    const row = parseAdminVoucherRow({
      id: 1,
      code: "SHIPFREE",
      ruleSummary: "Free ship weekend",
      active: true,
      minSubtotal: "50000",
      percent: "10",
      cap: "20000",
      fixedAmount: "0",
      freeShipping: true,
      startAt: "2026-01-01T00:00:00",
      endAt: null,
      createdAt: "2026-01-01T00:00:00",
      updatedAt: "2026-01-02T00:00:00",
    });
    expect(row.id).toBe(1);
    expect(row.code).toBe("SHIPFREE");
    expect(row.ruleSummary).toBe("Free ship weekend");
    expect(row.minSubtotal).toBe(50000);
    expect(row.percent).toBe(10);
    expect(row.cap).toBe(20000);
    expect(row.fixedAmount).toBe(0);
    expect(row.freeShipping).toBe(true);
    expect(row.startAt).toContain("2026-01-01");
    expect(row.endAt).toBeNull();
  });

  it("buildVoucherUpsertBody clears percent/fixed when freeShipping (backend conflict rule)", () => {
    const body = buildVoucherUpsertBody({
      code: "X",
      ruleSummary: null,
      active: true,
      minSubtotal: 0,
      percent: 15,
      cap: 5000,
      fixedAmount: 10000,
      freeShipping: true,
      startAt: null,
      endAt: null,
    });
    expect(body.freeShipping).toBe(true);
    expect(body.percent).toBe(0);
    expect(body.fixedAmount).toBe(0);
    expect(body.cap).toBe(5000);
  });

  it("toLocalDateInput strips time from ISO", () => {
    expect(toLocalDateInput("2026-04-01T15:30:00")).toBe("2026-04-01");
  });
});
