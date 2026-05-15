import { describe, expect, it } from "vitest";
import { filterNavGroupsForRole } from "./AdminSidebar";

describe("AdminSidebar role filter", () => {
  it("staff only sees POS sales menu", () => {
    const groups = filterNavGroupsForRole(false, true);
    const paths = groups.flatMap((g) => g.items.map((i) => i.path));
    expect(paths).toEqual(["/admin/pos", "/admin/invoices", "/admin/pending-orders"]);
  });

  it("admin keeps full menu", () => {
    const groups = filterNavGroupsForRole(true, false);
    const paths = groups.flatMap((g) => g.items.map((i) => i.path));
    expect(paths).toContain("/admin/promotions");
    expect(paths).toContain("/admin/revenue");
  });
});
