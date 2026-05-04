/** Bearer from storefront session (same storage key as sales quote / admin). */
export function storefrontAuthHeaders(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem("nhadan.auth.session.v1");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { accessToken?: string };
    if (typeof parsed?.accessToken === "string" && parsed.accessToken.length > 0) {
      return { Authorization: `Bearer ${parsed.accessToken}` };
    }
  } catch {
    /* ignore */
  }
  return {};
}
