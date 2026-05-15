import { describe, expect, it, vi, beforeEach } from "vitest";
import { BackendPaymentEventAdapter } from "./BackendPaymentEventAdapter";
import * as adminApi from "@/services/auth/adminApi";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
}));

describe("BackendPaymentEventAdapter", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("manual link sends orderCode only (no linkedBy)", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      paymentEvent: {
        id: "1",
        provider: "casso",
        providerTxId: "T1",
        amount: 100000,
        transferContent: "desc",
        matchedCode: null,
        bankAccount: null,
        bankSubAcc: null,
        txTime: null,
        linkedOrderCode: "DH-1",
        linkedAt: "2026-05-08T10:00:00",
        linkedBy: "admin",
        status: "linked",
        createdAt: "2026-05-08T10:00:00",
      },
    });
    const svc = new BackendPaymentEventAdapter();
    await svc.linkPaymentEvent("1", "DH-1");

    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/payment-events/1/link",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (vi.mocked(adminApi.adminFetchJson).mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
    ) as Record<string, unknown>;
    expect(body).toEqual({ orderCode: "DH-1" });
    expect(body).not.toHaveProperty("linkedBy");
  });

  it("unmatched page sends page/size/search/sort params to backend", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      content: [],
      totalElements: 12,
      number: 1,
      size: 25,
    });
    const svc = new BackendPaymentEventAdapter();
    await svc.listUnmatchedPaymentEventsPage({
      page: 2,
      pageSize: 25,
      search: "mb bank",
      sortField: "amount",
      sortDir: "asc",
    });
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith(
      "/api/payment-events/unmatched?page=1&size=25&sort=amount%2Casc&search=mb+bank",
    );
  });
});
