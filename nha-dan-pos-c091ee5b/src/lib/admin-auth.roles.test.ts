import { describe, expect, it } from "vitest";
import { isCustomerRole, roleLabelFromRoles } from "./admin-auth";

describe("admin-auth role mapping", () => {
  it("maps ROLE_USER and ROLE_CUSTOMER to customer", () => {
    expect(isCustomerRole(["ROLE_USER"])).toBe(true);
    expect(isCustomerRole(["ROLE_CUSTOMER"])).toBe(true);
    expect(roleLabelFromRoles(["ROLE_USER"])).toBe("Khách hàng");
    expect(roleLabelFromRoles(["ROLE_CUSTOMER"])).toBe("Khách hàng");
  });

  it("maps staff and admin labels", () => {
    expect(roleLabelFromRoles(["ROLE_STAFF"])).toBe("Nhân viên");
    expect(roleLabelFromRoles(["ROLE_ADMIN"])).toBe("Quản trị");
  });
});
