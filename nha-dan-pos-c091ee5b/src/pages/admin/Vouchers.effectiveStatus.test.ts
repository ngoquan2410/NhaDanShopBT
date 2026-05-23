import { describe, expect, it } from "vitest";
import type { AdminVoucherRow } from "@/services/admin/adminVouchersApi";
import { getVoucherEffectiveStatus } from "./Vouchers";

const base: AdminVoucherRow = {
  id: 1,
  code: "FREESHIP100",
  ruleSummary: null,
  active: true,
  minSubtotal: 0,
  percent: 0,
  cap: 0,
  fixedAmount: 0,
  freeShipping: true,
  startAt: "2026-05-12T00:00:00",
  endAt: "2026-05-12T23:59:59",
  createdAt: "2026-05-01T00:00:00",
  updatedAt: "2026-05-01T00:00:00",
};

describe("Vouchers admin effective status", () => {
  it("uses backend effectiveStatus as source of truth", () => {
    expect(getVoucherEffectiveStatus({ ...base, active: true, effectiveStatus: "expired" })).toBe("expired");
    expect(getVoucherEffectiveStatus({ ...base, active: false, effectiveStatus: "inactive" })).toBe("inactive");
    expect(getVoucherEffectiveStatus({ ...base, effectiveStatus: "running" })).toBe("running");
  });
});

