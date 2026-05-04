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
  if (!next) {
    return isAdmin ? "/admin" : "/account";
  }
  try {
    const pathOnly = next.split("?")[0] ?? next;
    if (isAdminAppPath(pathOnly) && !isAdmin) {
      return "/account";
    }
  } catch {
    /* ignore malformed next */
  }
  return next;
}
