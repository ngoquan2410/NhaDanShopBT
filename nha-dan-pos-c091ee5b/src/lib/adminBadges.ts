/** Dispatched after mutations that affect sidebar / topbar badge counts. */
export const ADMIN_BADGES_REFRESH_EVENT = "nhadan-admin-badges-refresh";

export function dispatchAdminBadgesRefresh(): void {
  window.dispatchEvent(new CustomEvent(ADMIN_BADGES_REFRESH_EVENT));
}
