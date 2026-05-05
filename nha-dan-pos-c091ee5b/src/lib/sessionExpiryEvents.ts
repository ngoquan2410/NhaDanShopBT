export const SESSION_EXPIRED_EVENT = "nhadan:session-expired";

export type SessionExpiredDetail = {
  /** Path + query after login redirect */
  nextPath: string;
};

export function dispatchSessionExpired(detail: SessionExpiredDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail }));
}
