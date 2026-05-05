import { dispatchSessionExpired } from "@/lib/sessionExpiryEvents";

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

function notifySessionLikelyExpired() {
  dispatchSessionExpired({ nextPath: window.location.pathname + window.location.search });
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
    notifySessionLikelyExpired();
    throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại tại /login");
  }

  throw new Error("Không thể xác thực admin để gọi API backend");
}

/** Download binary (e.g. Excel) with same refresh + 401 handling as {@link adminFetchJson}. */
export async function downloadAdminBlob(path: string, fallbackFilename: string): Promise<void> {
  let session = await ensureSession();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(path, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "*/*",
      },
    });
    if (res.status !== 401 && res.status !== 403) {
      if (!res.ok) {
        const data = await parseJsonSafe(res);
        throw new Error(errorMessage(data, res.status));
      }
      const blob = await res.blob();
      let name = fallbackFilename;
      const cd = res.headers.get("Content-Disposition");
      if (cd) {
        const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
        if (m?.[1]) name = decodeURIComponent(m[1].replace(/["']/g, ""));
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const refreshed = await refreshSession(session);
    if (refreshed) {
      session = refreshed;
      continue;
    }
    writeSession(null);
    notifySessionLikelyExpired();
    throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại tại /login");
  }
  throw new Error("Không thể tải file từ máy chủ");
}

/** Multipart image upload for {@code POST /api/images/upload}. */
export async function adminUploadImage(file: File): Promise<{ url: string }> {
  let session = await ensureSession();
  const body = new FormData();
  body.append("file", file);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch("/api/images/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      body,
    });
    if (res.status !== 401 && res.status !== 403) {
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errorMessage(data, res.status));
      const url = data?.url != null ? String(data.url) : "";
      if (!url) throw new Error("Máy chủ không trả về URL ảnh");
      return { url };
    }
    const refreshed = await refreshSession(session);
    if (refreshed) {
      session = refreshed;
      continue;
    }
    writeSession(null);
    notifySessionLikelyExpired();
    throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại tại /login");
  }
  throw new Error("Không thể upload ảnh");
}

export function clearAdminSession() {
  writeSession(null);
}

/** Expose read-only session for adapters that should avoid admin prompts when not logged in. */
export function getAdminSession(): AuthSession | null {
  return readSession();
}
