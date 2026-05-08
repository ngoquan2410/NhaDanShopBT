import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cartActions } from "@/lib/cart";
import { dispatchSessionExpired } from "@/lib/sessionExpiryEvents";

export const AUTH_SESSION_KEY = "nhadan.auth.session.v1";

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  tokenType?: string | null;
  expiresAt: number;
  username: string;
  fullName?: string | null;
  roles: string[];
  customerId?: number | null;
  /** From last login/refresh — TOTP state for UI */
  totpEnabled?: boolean;
}

interface AdminAuthState {
  session: AuthSession | null;
  user: { username: string; fullName?: string | null; customerId?: number | null } | null;
  isAdmin: boolean;
  isUser: boolean;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string; totpRequired?: boolean; preAuthToken?: string }>;
  verifyTotp: (preAuthToken: string, otp: string) => Promise<{ error?: string }>;
  signUp: (username: string, password: string, fullName?: string, phone?: string) => Promise<{ error?: string; code?: string }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
}

const Ctx = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((next: AuthSession | null) => {
    setSessionState(next);
    try {
      if (next) window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(AUTH_SESSION_KEY);
      window.sessionStorage.removeItem("nhadan.adminAuth.session");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
      setSessionState(raw ? JSON.parse(raw) as AuthSession : null);
      window.sessionStorage.removeItem("nhadan.adminAuth.session");
    } catch { setSessionState(null); }
    setLoading(false);
  }, []);

  const normalize = useCallback((data: any): AuthSession => ({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    tokenType: data.tokenType ?? "Bearer",
    expiresAt: Date.now() + Number(data.expiresIn ?? 900) * 1000,
    username: data.username,
    fullName: data.fullName ?? null,
    roles: Array.isArray(data.roles) ? data.roles : Array.from(data.roles ?? []),
    customerId: data.customerId ?? null,
    totpEnabled: Boolean(data.totpEnabled),
  }), []);

  const parse = async (res: Response) => {
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  };

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await parse(res);
    if (!res.ok) return { error: data?.detail ?? data?.message ?? `HTTP ${res.status}` };
    if (data?.totpRequired) return { totpRequired: true, preAuthToken: data.accessToken };
    persist(normalize(data));
    return {};
  }, [normalize, persist]);

  const verifyTotp = useCallback(async (preAuthToken: string, otp: string) => {
    const res = await fetch("/api/auth/verify-totp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ preAuthToken, otp }) });
    const data = await parse(res);
    if (!res.ok) return { error: data?.detail ?? data?.message ?? `HTTP ${res.status}` };
    persist(normalize(data));
    return {};
  }, [normalize, persist]);

  const signUp = useCallback(async (username: string, password: string, fullName?: string, phone?: string) => {
    const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ username, password, fullName, phone }) });
    const data = await parse(res);
    if (!res.ok) return { error: data?.detail ?? data?.message ?? `HTTP ${res.status}`, code: data?.code };
    persist(normalize(data));
    return {};
  }, [normalize, persist]);

  const refreshSession = useCallback(async () => {
    if (!session?.refreshToken) return null;
    const res = await fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    const data = await parse(res);
    if (!res.ok) {
      persist(null);
      dispatchSessionExpired({ nextPath: window.location.pathname + window.location.search });
      return null;
    }
    const next = normalize(data);
    persist(next);
    return next;
  }, [normalize, persist, session?.refreshToken]);

  useEffect(() => {
    if (!session?.accessToken || !session.expiresAt) return;
    let cancelled = false;
    const nextPath = () => window.location.pathname + window.location.search;
    const expireNow = async () => {
      if (cancelled) return;
      if (session.refreshToken) {
        const refreshed = await refreshSession();
        if (refreshed || cancelled) return;
      }
      persist(null);
      dispatchSessionExpired({ nextPath: nextPath() });
    };
    const delay = Math.max(0, session.expiresAt - Date.now());
    const timeout = window.setTimeout(() => void expireNow(), delay);
    const checkOnFocus = () => {
      if (Date.now() >= session.expiresAt) void expireNow();
    };
    window.addEventListener("focus", checkOnFocus);
    document.addEventListener("visibilitychange", checkOnFocus);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("focus", checkOnFocus);
      document.removeEventListener("visibilitychange", checkOnFocus);
    };
  }, [persist, refreshSession, session?.accessToken, session?.expiresAt, session?.refreshToken]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SESSION_KEY) return;
      try {
        setSessionState(event.newValue ? JSON.parse(event.newValue) as AuthSession : null);
      } catch {
        setSessionState(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signOut = useCallback(async () => {
    const accessToken = session?.accessToken;
    const refreshToken = session?.refreshToken;
    try {
      if (refreshToken) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        await fetch("/api/auth/logout", {
          method: "POST",
          headers,
          body: JSON.stringify({ refreshToken }),
        }).catch(() => undefined);
      }
    } finally {
      try {
        cartActions.clear();
      } catch {
        /* ignore */
      }
      persist(null);
    }
  }, [persist, session?.accessToken, session?.refreshToken]);

  const refreshRole = useCallback(async () => {
    if (session?.refreshToken) await refreshSession();
  }, [refreshSession, session?.refreshToken]);

  const isAdmin = !!session?.roles?.includes("ROLE_ADMIN");
  const isUser = !!session?.roles?.includes("ROLE_USER");

  const value = useMemo<AdminAuthState>(
    () => ({
      session,
      user: session ? { username: session.username, fullName: session.fullName, customerId: session.customerId } : null,
      isAdmin,
      isUser,
      loading,
      signIn,
      verifyTotp,
      signUp,
      signOut,
      refreshRole,
      refreshSession,
    }),
    [session, isAdmin, isUser, loading, signIn, verifyTotp, signUp, signOut, refreshRole, refreshSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return v;
}

export const useAuth = useAdminAuth;

