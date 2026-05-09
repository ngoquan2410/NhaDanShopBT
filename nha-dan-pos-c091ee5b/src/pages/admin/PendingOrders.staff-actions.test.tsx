import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminPendingOrders from "./PendingOrders";

const mockedUseService = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  useAdminAuth: () => ({ isAdmin: false }),
}));

vi.mock("@/hooks/useService", () => ({
  useService: (...args: unknown[]) => mockedUseService(...args),
}));

vi.mock("@/services", () => ({
  pendingOrders: {
    list: vi.fn(),
    counts: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
}));

describe("PendingOrders staff actions", () => {
  beforeEach(() => {
    mockedUseService.mockReset();
    mockedUseService
      .mockReturnValueOnce({
        data: {
          items: [
            {
              id: "po-1",
              code: "PO-1",
              status: "pending_payment",
              paymentMethod: "bank_transfer",
              pricingBreakdownSnapshot: { total: 100000 },
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
              customerName: "A",
              lines: [],
            },
          ],
          total: 1,
        },
        loading: false,
        error: null,
        isEmpty: false,
        reload: vi.fn(),
      })
      .mockReturnValueOnce({
        data: {
          all: 1,
          pending_payment: 1,
          waiting_confirm: 0,
          paid_auto: 0,
          confirmed: 0,
          cancelled: 0,
        },
        loading: false,
        error: null,
        isEmpty: false,
        reload: vi.fn(),
      });
  });

  it("does not show confirm/cancel actions for staff", () => {
    render(<AdminPendingOrders />);
    expect(screen.queryByText("Xác nhận")).toBeNull();
    expect(screen.queryByText("Hủy")).toBeNull();
  });
});
