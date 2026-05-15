import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { AdminAuthGuard } from "./AdminAuthGuard";

const mockedUseAdminAuth = vi.fn();

vi.mock("@/lib/admin-auth", () => ({
  useAdminAuth: () => mockedUseAdminAuth(),
}));

function renderGuard(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminAuthGuard><Outlet /></AdminAuthGuard>}>
          <Route index element={<div>admin-home</div>} />
          <Route path="pos" element={<div>pos-page</div>} />
          <Route path="pending-orders" element={<div>pending-page</div>} />
          <Route path="promotions" element={<div>promo-page</div>} />
        </Route>
        <Route path="/account" element={<div>account-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminAuthGuard role behavior", () => {
  it("blocks customer from admin route", () => {
    mockedUseAdminAuth.mockReturnValue({
      loading: false,
      session: { roles: ["ROLE_USER"] },
      isAdmin: false,
      isStaff: false,
    });
    renderGuard("/admin/promotions");
    expect(screen.getByText("account-page")).toBeTruthy();
  });

  it("allows staff to access POS route", () => {
    mockedUseAdminAuth.mockReturnValue({
      loading: false,
      session: { roles: ["ROLE_STAFF"] },
      isAdmin: false,
      isStaff: true,
    });
    renderGuard("/admin/pos");
    expect(screen.getByText("pos-page")).toBeTruthy();
  });

  it("allows staff to access pending-orders route", () => {
    mockedUseAdminAuth.mockReturnValue({
      loading: false,
      session: { roles: ["ROLE_STAFF"] },
      isAdmin: false,
      isStaff: true,
    });
    renderGuard("/admin/pending-orders");
    expect(screen.getByText("pending-page")).toBeTruthy();
  });

  it("redirects staff away from forbidden admin management route", () => {
    mockedUseAdminAuth.mockReturnValue({
      loading: false,
      session: { roles: ["ROLE_STAFF"] },
      isAdmin: false,
      isStaff: true,
    });
    renderGuard("/admin/promotions");
    expect(screen.queryByText("promo-page")).toBeNull();
    expect(screen.getByText("pos-page")).toBeTruthy();
  });
});
