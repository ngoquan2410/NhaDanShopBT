/**
 * HTTP helpers against API_BASE_URL for deterministic seed/cleanup (Bearer optional).
 */

/** @param {Record<string, unknown>} body */
function extractProblemSummary(body) {
  if (!body || typeof body !== "object") return null;
  /** @type {Record<string, unknown>} */
  const o = /** @type {Record<string, unknown>} */ (body);
  return {
    type: o.type,
    title: o.title,
    status: o.status,
    detail: o.detail,
    instance: o.instance,
    code: o.code,
    fieldErrors: o.fieldErrors,
  };
}

function joinUrl(origin, path) {
  const o = origin.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${o}${p}`;
}

/**
 * @param {string} apiBaseUrl
 * @param {{ accessToken?: string | null }} [auth]
 */
export function createApiHelper(apiBaseUrl, auth = {}) {
  const registry = [];
  const tokenHolder = { accessToken: auth.accessToken ?? null };

  function headers(extra = {}) {
    const h = { Accept: "application/json", ...extra };
    if (tokenHolder.accessToken) {
      h.Authorization = `Bearer ${tokenHolder.accessToken}`;
    }
    return h;
  }

  return {
    origin: apiBaseUrl,

    /** Bearer for subsequent authenticated `fetchJson`/`fetch`. */
    setAccessToken(tok) {
      tokenHolder.accessToken = tok ?? null;
    },

    getAccessToken() {
      return tokenHolder.accessToken;
    },

    /**
     * POST /api/auth/login — returns body; omits Bearer on this call.
     */
    async authLoginJson(username, password) {
      const res = await fetch(joinUrl(apiBaseUrl, "/api/auth/login"), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const text = await res.text();
      /** @type {Record<string, unknown>} */
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { _raw: text };
      }
      if (!res.ok) {
        const err = new Error(`/api/auth/login HTTP ${res.status}`);
        err.response = res;
        err.body = body;
        throw err;
      }
      return body;
    },

    /** Register idempotent cleanup (LIFO). */
    registerCleanup(fn) {
      registry.push(fn);
    },

    async runCleanups() {
      while (registry.length) {
        const fn = registry.pop();
        try {
          await fn();
        } catch (e) {
          console.warn("[api cleanup]", e?.message || e);
        }
      }
    },

    /**
     * @param {string} pathname
     * @param {RequestInit & { json?: unknown }} [opts]
     */
    async fetch(pathname, opts = {}) {
      const { json, timeout = 30000, headers: hdrIn = {}, method = "GET", ...rest } = opts;
      const hdr = headers(hdrIn);
      const init = { method, ...rest, headers: hdr };
      if (json !== undefined) {
        hdr["Content-Type"] = "application/json";
        init.body = JSON.stringify(json);
      }
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), timeout);
      try {
        return await fetch(joinUrl(apiBaseUrl, pathname), { ...init, signal: ac.signal });
      } finally {
        clearTimeout(t);
      }
    },

    async fetchJson(pathname, opts = {}) {
      const method = opts.method || "GET";
      const res = await this.fetch(pathname, opts);
      const text = await res.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { _raw: text };
      }
      if (!res.ok) {
        const url = joinUrl(apiBaseUrl, pathname);
        const problem = extractProblemSummary(body);
        const detailLine =
          (problem && typeof problem.detail === "string" && problem.detail) ||
          (typeof body?._raw === "string" ? String(body._raw).slice(0, 800) : "") ||
          (typeof body === "object" && body !== null ? JSON.stringify(body).slice(0, 800) : "");
        const msg = `${pathname} HTTP ${res.status}${detailLine ? ` — ${detailLine}` : ""}`;
        const err = new Error(msg);
        err.response = res;
        err.body = body;
        err.diagnostics = {
          method,
          url,
          pathname,
          hasAuthorization: Boolean(tokenHolder.accessToken),
          requestHeaders: {
            Accept: "application/json",
            "Content-Type": opts.json !== undefined ? "application/json" : undefined,
            Authorization: tokenHolder.accessToken ? "Bearer <redacted>" : undefined,
          },
          requestBody: opts.json !== undefined ? opts.json : undefined,
          responseStatus: res.status,
          responseBody: body,
          problem,
        };
        throw err;
      }
      return body;
    },
  };
}
