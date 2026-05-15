import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPendingOrders from "./PendingOrders";

const listMock = vi.fn();
const countsMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({
  useAdminAuth: () => ({ isAdmin: true }),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/services", () => ({
  pendingOrders: {
    list: (...args: unknown[]) => listMock(...args),
    counts: (...args: unknown[]) => countsMock(...args),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
}));

describe("AdminPendingOrders server-side pagination and counts", () => {
  beforeEach(() => {
    listMock.mockReset();
    countsMock.mockReset();
    listMock.mockResolvedValue({
      items: [
        {
          id: "1",
          code: "DH-20260508-001",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          status: "pending_payment",
          customerName: "A",
          customerPhone: "0909",
          paymentMethod: "bank_transfer",
          paymentReference: "DH-20260508-001",
          lines: [],
          giftLinesSnapshot: [],
          pricingBreakdownSnapshot: {
            subtotal: 100000,
            manualDiscount: 0,
            promotionDiscount: 0,
            voucherDiscount: 0,
            shippingFee: 0,
            shippingDiscount: 0,
            vatBase: 0,
            vatPercent: 0,
            vatAmount: 0,
            vat: 0,
            total: 100000,
          },
        },
      ],
      total: 50,
      page: 1,
      pageSize: 20,
    });
    countsMock.mockResolvedValue({
      all: 50,
      pending_payment: 30,
      waiting_confirm: 10,
      paid_auto: 5,
      confirmed: 3,
      cancelled: 2,
    });
  });

  it("renders tab counts from counts endpoint, not current page length", async () => {
    render(<AdminPendingOrders />);
    expect(await screen.findByText("Tất cả (50)")).toBeTruthy();
    expect(screen.getByText("Chờ thanh toán (30)")).toBeTruthy();
    expect(screen.getByText("Chờ xác nhận (10)")).toBeTruthy();
    expect(screen.getByText("Đã nhận CK (5)")).toBeTruthy();
  });

  it("passes tab status to backend list query", async () => {
    render(<AdminPendingOrders />);
    await screen.findByText("Tất cả (50)");
    fireEvent.click(screen.getByRole("button", { name: /Chờ thanh toán/ }));
    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "pending_payment",
        }),
      );
    });
  });

  it("omits blank search query param", async () => {
    render(<AdminPendingOrders />);
    await screen.findByText("Tất cả (50)");
    const searchBox = screen.getByPlaceholderText("Tìm theo mã đơn, tên/SĐT khách, mã tham chiếu...");
    fireEvent.change(searchBox, { target: { value: "   " } });
    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ query: undefined }));
    }, { timeout: 1500 });
  });
});

