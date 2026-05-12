import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adminApi from "@/services/auth/adminApi";
import { adminRoles, adminUsers } from "./adminBackend";

vi.mock("@/services/auth/adminApi", () => ({
  adminFetchJson: vi.fn(),
  downloadAdminBlob: vi.fn(),
}));

describe("adminBackend roles mapping", () => {
  beforeEach(() => {
    vi.mocked(adminApi.adminFetchJson).mockReset();
  });

  it("loads assignable roles from backend endpoint", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue([
      { id: 1, name: "ROLE_ADMIN", label: "Quản trị viên" },
      { id: 2, name: "ROLE_STAFF", label: "Nhân viên" },
    ]);

    const roles = await adminRoles.list();
    expect(adminApi.adminFetchJson).toHaveBeenCalledWith("/api/admin/roles");
    expect(roles.map((r) => r.name)).toEqual(["ROLE_ADMIN", "ROLE_STAFF"]);
  });

  it("sends ROLE_STAFF when saving a staff user", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      id: 11,
      username: "staff_case",
      fullName: "Staff Case",
      isActive: true,
      roles: ["ROLE_STAFF"],
    });

    await adminUsers.save({
      username: "staff_case",
      fullName: "Staff Case",
      roleName: "ROLE_STAFF",
      password: "Secret12!ab",
    });

    const body = JSON.parse(
      (vi.mocked(adminApi.adminFetchJson).mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
    ) as { roles?: string[] };
    expect(body.roles).toEqual(["ROLE_STAFF"]);
    expect(body.roles).not.toContain("ROLE_USER");
  });

  it("sends ROLE_ADMIN when saving an admin user", async () => {
    vi.mocked(adminApi.adminFetchJson).mockResolvedValue({
      id: 12,
      username: "admin_case",
      fullName: "Admin Case",
      isActive: true,
      roles: ["ROLE_ADMIN"],
    });

    await adminUsers.save({
      username: "admin_case",
      fullName: "Admin Case",
      roleName: "ROLE_ADMIN",
      password: "Secret12!ab",
    });

    const body = JSON.parse(
      (vi.mocked(adminApi.adminFetchJson).mock.calls[0]?.[1] as { body?: string })?.body ?? "{}",
    ) as { roles?: string[] };
    expect(body.roles).toEqual(["ROLE_ADMIN"]);
  });
});
