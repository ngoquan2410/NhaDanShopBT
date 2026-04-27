type AuthSession = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  username?: string | null;
  fullName?: string | null;
};

// Minimal admin auth bridge for backend-owned management APIs. Keep this scoped
// to admin service calls rather than treating it as the app-wide auth pattern.
const STORAGE_KEY = "nhadan.adminAuth.session";

function readSession(): AuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: AuthSession | null) {
  try {
    if (!session) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
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

async function loginWithPrompts(): Promise<AuthSession> {
  const username = window.prompt("Nhập tài khoản admin để gọi API backend:");
  if (!username) throw new Error("Thiếu tài khoản admin để gọi API backend");
  const password = window.prompt(`Nhập mật khẩu cho tài khoản ${username}:`);
  if (!password) throw new Error("Thiếu mật khẩu admin để gọi API backend");

  const loginRes = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  const loginData = await parseJsonSafe(loginRes);
  if (!loginRes.ok) {
    throw new Error(errorMessage(loginData, loginRes.status));
  }

  if (loginData?.totpRequired) {
    const otp = window.prompt("Nhập mã OTP 6 số:");
    if (!otp) throw new Error("Thiếu mã OTP để hoàn tất đăng nhập admin");
    const otpRes = await fetch("/api/auth/verify-totp", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preAuthToken: loginData.accessToken,
        otp,
      }),
    });
    const otpData = await parseJsonSafe(otpRes);
    if (!otpRes.ok) {
      throw new Error(errorMessage(otpData, otpRes.status));
    }
    const session: AuthSession = {
      accessToken: otpData.accessToken,
      refreshToken: otpData.refreshToken,
      tokenType: otpData.tokenType,
      username: otpData.username,
      fullName: otpData.fullName,
    };
    writeSession(session);
    return session;
  }

  const session: AuthSession = {
    accessToken: loginData.accessToken,
    refreshToken: loginData.refreshToken,
    tokenType: loginData.tokenType,
    username: loginData.username,
    fullName: loginData.fullName,
  };
  writeSession(session);
  return session;
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
  };
  writeSession(next);
  return next;
}

async function ensureSession(): Promise<AuthSession> {
  const existing = readSession();
  if (existing?.accessToken) return existing;
  return loginWithPrompts();
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
    session = await loginWithPrompts();
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
