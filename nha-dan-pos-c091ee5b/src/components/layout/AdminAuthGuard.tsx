import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAdminAuth } from "@/lib/admin-auth";

export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const { loading, session, isAdmin, isStaff } = useAdminAuth();
  const location = useLocation();
  const path = location.pathname;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Đang kiểm tra phiên đăng nhập...
      </div>
    );
  }

  if (!session) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace state={{ from: location }} />;
  }

  if (!isAdmin && !isStaff) {
    return <Navigate to="/account" replace />;
  }

  if (isStaff) {
    const allowedStaffPrefixes = [
      "/admin/pos",
      "/admin/invoices",
      "/admin/pending-orders",
      "/admin",
    ];
    const staffAllowed = allowedStaffPrefixes.some((prefix) => {
      if (prefix === "/admin") return path === "/admin";
      return path === prefix || path.startsWith(`${prefix}/`);
    });
    if (!staffAllowed) {
      return <Navigate to="/admin/pos" replace />;
    }
  }

  return <>{children}</>;
}
