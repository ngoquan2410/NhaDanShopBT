import { describe, expect, it } from "vitest";
import { isAdminAppPath, resolvePostLoginPath } from "./postLoginDestination";

describe("postLoginDestination", () => {
  it("detects admin app paths", () => {
    expect(isAdminAppPath("/admin")).toBe(true);
    expect(isAdminAppPath("/admin/pending-orders")).toBe(true);
    expect(isAdminAppPath("/account")).toBe(false);
    expect(isAdminAppPath("/checkout")).toBe(false);
  });

  it("sends ROLE_USER away from admin next=/admin to /account", () => {
    expect(resolvePostLoginPath("/admin?tab=1", ["ROLE_USER"])).toBe("/account");
    expect(resolvePostLoginPath("/admin/pending-orders", ["ROLE_USER"])).toBe("/account");
  });

  it("allows ROLE_ADMIN to admin next destinations", () => {
    expect(resolvePostLoginPath("/admin", ["ROLE_ADMIN"])).toBe("/admin");
    expect(resolvePostLoginPath("/admin/pos", ["ROLE_ADMIN"])).toBe("/admin/pos");
  });

  it("ROLE_USER preserves non-admin next", () => {
    expect(resolvePostLoginPath("/checkout", ["ROLE_USER"])).toBe("/checkout");
  });

  it("defaults ROLE_ADMIN without next to /admin and ROLE_USER to /account", () => {
    expect(resolvePostLoginPath(null, ["ROLE_ADMIN"])).toBe("/admin");
    expect(resolvePostLoginPath(null, ["ROLE_STAFF"])).toBe("/admin/pos");
    expect(resolvePostLoginPath(null, ["ROLE_USER"])).toBe("/account");
  });

  it("restricts ROLE_STAFF to POS admin routes", () => {
    expect(resolvePostLoginPath("/admin/promotions", ["ROLE_STAFF"])).toBe("/admin/pos");
    expect(resolvePostLoginPath("/admin/pos", ["ROLE_STAFF"])).toBe("/admin/pos");
    expect(resolvePostLoginPath("/admin/invoices", ["ROLE_STAFF"])).toBe("/admin/invoices");
    expect(resolvePostLoginPath("/admin/pending-orders", ["ROLE_STAFF"])).toBe("/admin/pending-orders");
  });
});
