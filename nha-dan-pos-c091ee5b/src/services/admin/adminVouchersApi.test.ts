import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import {
  buildVoucherUpsertBody,
  dateInputToEndAt,
  dateInputToStartAt,
  fetchAdminVoucherPage,
  parseAdminVoucherRow,
  toLocalDateInput,
} from "./adminVouchersApi";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("adminVouchersApi", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });
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
      effectiveStatus: "expired",
      currentlyActive: false,
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
    expect(row.effectiveStatus).toBe("expired");
    expect(row.currentlyActive).toBe(false);
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

  it("serializes date input as local LocalDateTime strings without offset", () => {
    expect(dateInputToStartAt("2026-05-12")).toBe("2026-05-12T00:00:00");
    expect(dateInputToEndAt("2026-05-12")).toBe("2026-05-12T23:59:59");
    expect(dateInputToStartAt("2026-05-12")).not.toMatch(/Z|\+07:00/);
    expect(dateInputToEndAt("2026-05-12")).not.toMatch(/Z|\+07:00/);
  });

  it("sends server-side list query params for voucher page", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    await fetchAdminVoucherPage({
      page: 0,
      size: 20,
      search: "ship free",
      status: "active",
      sort: [{ field: "code", direction: "asc" }],
    });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/vouchers?page=0&size=20&sort=code%2Casc&search=ship+free&status=active",
    );
  });

  it("omits blank search and all status params", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 });
    await fetchAdminVoucherPage({
      page: 1,
      size: 20,
      search: "   ",
      status: "all",
    });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/vouchers?page=1&size=20&sort=createdAt%2Cdesc",
    );
  });
});
