/** Path part only (no query) for admin area under unified `/admin` layout. */
export function isAdminAppPath(pathname: string): boolean {
  const p = pathname.split("?")[0] ?? pathname;
  return p === "/admin" || p.startsWith("/admin/");
}

/**
 * Resolve post-login navigation target: non-admins must never be sent to `/admin/**`
 * (avoids AdminAuthGuard ↔ /login loops when `next` pointed at admin).
 */
export function resolvePostLoginPath(next: string | null, roles: string[]): string {
  const isAdmin = roles.includes("ROLE_ADMIN");
  const isStaff = roles.includes("ROLE_STAFF");
  if (!next) {
    if (isAdmin) return "/admin";
    if (isStaff) return "/admin/pos";
    return "/account";
  }
  try {
    const pathOnly = next.split("?")[0] ?? next;
    if (isAdminAppPath(pathOnly) && !isAdmin && !isStaff) {
      return "/account";
    }
    if (isAdminAppPath(pathOnly) && isStaff) {
      const staffAllowed = pathOnly === "/admin"
        || pathOnly.startsWith("/admin/pos")
        || pathOnly.startsWith("/admin/invoices")
        || pathOnly.startsWith("/admin/pending-orders");
      if (!staffAllowed) return "/admin/pos";
    }
  } catch {
    /* ignore malformed next */
  }
  return next;
}
