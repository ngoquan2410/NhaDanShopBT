import { dispatchSessionExpired } from "@/lib/sessionExpiryEvents";

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

const STORAGE_KEY = "nhadan.auth.session.v1";

type StoredSession = {
  accessToken?: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  username?: string | null;
  fullName?: string | null;
  roles?: string[];
  customerId?: number | null;
  expiresAt?: number;
};

function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredSession : null;
  } catch {
    return null;
  }
}

function writeSession(next: StoredSession | null) {
  try {
    if (!next) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem("nhadan.adminAuth.session");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.sessionStorage.removeItem("nhadan.adminAuth.session");
  } catch {
    /* ignore */
  }
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  if (!session.refreshToken) return null;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    writeSession(null);
    return null;
  }
  const next: StoredSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? session.refreshToken,
    tokenType: data.tokenType ?? session.tokenType,
    username: data.username ?? session.username,
    fullName: data.fullName ?? session.fullName,
    roles: Array.isArray(data.roles) ? data.roles : session.roles,
    customerId: data.customerId ?? session.customerId,
    expiresAt: Date.now() + Number(data.expiresIn ?? 900) * 1000,
  };
  writeSession(next);
  return next;
}

function sessionExpired() {
  writeSession(null);
  dispatchSessionExpired({ nextPath: window.location.pathname + window.location.search });
}

export async function storefrontFetch(path: string, init?: RequestInit): Promise<Response> {
  let session = readSession();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    });
    if (res.status !== 401 && res.status !== 403) return res;
    if (!session?.accessToken) return res;
    const refreshed = await refreshSession(session);
    if (refreshed) {
      session = refreshed;
      continue;
    }
    sessionExpired();
    return res;
  }
  return fetch(path, init);
}
