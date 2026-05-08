/**
 * Environment-driven automation config (BASE_URL, API proxy origin, credentials).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeOrigin(url) {
  return String(url || "").replace(/\/$/, "");
}

/**
 * Selenium Node helpers (warmup, fixtures) must not use a Vite-only origin — actuator + /api on Boot.
 * If env mistakenly sets API_BASE_URL to :5173/:5174, coerce to local Spring (default port 8080).
 */
function coerceApiBaseForNode(url) {
  const n = normalizeOrigin(url);
  if (!n) return n;
  if (/:(5173|5174)(\/)?$/.test(n)) {
    const override = normalizeOrigin(process.env.SPRING_BOOT_URL || "");
    return override || "http://127.0.0.1:8080";
  }
  return n;
}

function parseTags(argv, env) {
  const collected = [];
  for (const a of argv) {
    if (a.startsWith("--tags=")) {
      collected.push(...a.slice("--tags=".length).split(",").map((t) => t.trim()).filter(Boolean));
    }
  }
  if (collected.length > 0) return collected;
  const raw = env.AUTOMATION_TAGS || "";
  if (raw.trim()) return raw.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

function parseScope(argv, env) {
  const arg = argv.find((a) => a.startsWith("--scope="));
  if (arg) return arg.slice("--scope=".length).trim().toLowerCase();
  return (env.AUTOMATION_SCOPE || "smoke").trim().toLowerCase();
}

/** @param {string[]} argv */
export function loadAutomationConfig(argv = process.argv.slice(2)) {
  const env = process.env;
  const baseUrl = normalizeOrigin(env.BASE_URL || env.VITE_URL || "http://localhost:5173");
  /** Explicit override; otherwise Node calls + actuator warmup hit Spring directly when FE is Vite (:5173/:5174). */
  const apiFromEnv = normalizeOrigin(env.API_BASE_URL || "");
  const looksLikeViteDev = /:(5173|5174)(\/)?$/.test(baseUrl);
  const rawApiChoice = apiFromEnv
    ? apiFromEnv
    : looksLikeViteDev
      ? "http://127.0.0.1:8080"
      : baseUrl;
  const apiBaseUrl = coerceApiBaseForNode(rawApiChoice);

  const scope = parseScope(argv, env);
  const explicitTags = parseTags(argv, env);

  /** Tags implied by scope preset (ANY-match filter against spec.tags). */
  const scopeTags =
    scope === "full" || scope === "regression"
      ? []
      : scope === "storefront-auth"
        ? ["storefront-auth-suite"]
      : scope === "storefront"
        ? ["storefront"]
        : scope === "admin"
          ? ["admin"]
          : scope === "admin-sales"
            ? ["admin-sales-suite"]
            : scope === "admin-ops"
              ? ["p5-catalog", "p5-inventory", "p5-production", "p5-commercial", "p5-directory", "p5-reports"]
            : scope === "settings-integrations"
              ? ["p5-settings"]
              : scope === "critical-watchlist"
                ? [
                    "watchlist-pos-invoice",
                    "watchlist-invoice-lifecycle",
                    "watchlist-inventory-truth",
                    "watchlist-receipts-adjustments",
                    "watchlist-pending-to-invoice",
                    "watchlist-combo-production",
                    "watchlist-revenue-profit",
                  ]
              : scope === "promotion-checkout"
                ? ["promotion-checkout"]
              : scope === "smoke"
                ? ["smoke"]
                : [scope];

  const fullScope = scope === "full" || scope === "regression";
  const adminUsername =
    env.ADMIN_USERNAME?.trim() ||
    env.ADMIN_EMAIL?.trim() ||
    env.ADMIN_LOGIN?.trim() ||
    (fullScope ? "admin" : "");
  const adminPassword =
    env.ADMIN_PASSWORD?.trim() || (fullScope ? "admin123" : "");

  /** Full/regression: default USER (bootstrap creates via /api/auth/signup) so storefront-auth does not warn-skip. */
  const fullScopeUser = fullScope;
  const userUsername =
    env.USER_USERNAME?.trim() ||
    env.USER_EMAIL?.trim() ||
    env.USER_LOGIN?.trim() ||
    (fullScopeUser ? "sf_e2e_customer" : "");
  const userPassword =
    env.USER_PASSWORD?.trim() || (fullScopeUser ? "Auto_e2e_9!PassOk" : "");

  const seleniumRoot = path.join(__dirname);
  const repoRoot = path.join(__dirname, "..", "..");
  const artifactDir = path.join(repoRoot, "automation-output");

  return {
    baseUrl,
    apiBaseUrl,
    scope,
    /** Empty = run all specs (subject to scopeTags / explicitTags). */
    scopeTags,
    explicitTags,
    adminUsername,
    adminPassword,
    userUsername,
    userPassword,
    headed: argv.includes("--headed") || env.HEADLESS === "0",
    /** Warm BE via actuator before browser (full-stack CI). */
    warmup: !argv.includes("--no-warmup"),
    repoRoot,
    seleniumRoot,
    artifactDir,
    specsGlobDir: path.join(__dirname, "specs"),
  };
}
