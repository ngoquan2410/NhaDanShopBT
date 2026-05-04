type AuthSession = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  username?: string | null;
  fullName?: string | null;
  roles?: string[];
  customerId?: number | null;
  expiresAt?: number;
};

const STORAGE_KEY = "nhadan.auth.session.v1";

function readSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  try {
    if (!session) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.removeItem("nhadan.adminAuth.session");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    window.sessionStorage.removeItem("nhadan.adminAuth.session");
  } catch {
    /* ignore storage failures */
  }
}

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function errorMessage(data: any, fallbackStatus: number): string {
  return data?.detail ?? data?.message ?? data?.error ?? `HTTP ${fallbackStatus}`;
}

async function refreshSession(session: AuthSession | null): Promise<AuthSession | null> {
  if (!session?.refreshToken) return null;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    writeSession(null);
    return null;
  }
  const next: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tokenType: data.tokenType,
    username: data.username ?? session.username,
    fullName: data.fullName ?? session.fullName,
    roles: Array.isArray(data.roles) ? data.roles : session.roles,
    customerId: data.customerId ?? session.customerId,
    expiresAt: Date.now() + Number(data.expiresIn ?? 900) * 1000,
  };
  writeSession(next);
  return next;
}

async function ensureSession(): Promise<AuthSession> {
  const existing = readSession();
  if (existing?.accessToken) return existing;
  throw new Error("Bạn cần đăng nhập tại /login để gọi API backend");
}

export async function adminFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let session = await ensureSession();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${session.accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
    if (res.status !== 401 && res.status !== 403) {
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errorMessage(data, res.status));
      return data as T;
    }

    const refreshed = await refreshSession(session);
    if (refreshed) {
      session = refreshed;
      continue;
    }
    writeSession(null);
    throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại tại /login");
  }

  throw new Error("Không thể xác thực admin để gọi API backend");
}

export function clearAdminSession() {
  writeSession(null);
}

/** Expose read-only session for adapters that should avoid admin prompts when not logged in. */
export function getAdminSession(): AuthSession | null {
  return readSession();
}
