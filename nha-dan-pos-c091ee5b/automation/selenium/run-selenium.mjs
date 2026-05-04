/**
 * Selenium automation runner — multi-spec suite with helpers, env config, seed/cleanup hooks, artifacts.
 * Requires: chromedriver on PATH or Selenium Manager (selenium-webdriver 4.6+).
 *
 * Env origins:
 * - `BASE_URL` — Vite storefront (default `http://localhost:5173`). Alias: `VITE_URL`.
 * - `API_BASE_URL` — Backend origin when the browser proxies `/api` elsewhere (default `BASE_URL`).
 * - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin dashboard smoke (`smoke-admin-login`).
 * - `USER_USERNAME` / `USER_PASSWORD` — non-admin customer journeys (must not carry `ROLE_ADMIN`).
 *
 * Run:
 *   RUN_AUTOMATION=1 npm run test:automation
 *   RUN_AUTOMATION=1 HEADLESS=0 npm run test:automation -- --headed
 *   RUN_AUTOMATION=1 AUTOMATION_SCOPE=full npm run test:automation -- --run
 *   RUN_AUTOMATION=1 AUTOMATION_SCOPE=storefront-auth npm run test:automation -- --run
 *   RUN_AUTOMATION=1 npm run test:automation -- --run --tags=smoke,storefront
 *
 * Outputs: screenshots/HTML/logs on failure under `automation-output/` plus `automation-summary.json`.
 * Full-stack: warm BE with `GET {API_BASE_URL}/actuator/health` (`--no-warmup` to disable).
 */

import { loadAutomationConfig } from "./config.mjs";
import { runAutomationSuite } from "./runner.mjs";

/** Gate automation: RUN_AUTOMATION=1 (preferred) or RUN_FE_BE_E2E=1 (legacy alias for CI). */
const run =
  process.env.RUN_AUTOMATION === "1" ||
  process.env.RUN_FE_BE_E2E === "1" ||
  process.argv.includes("--run");

if (!run) {
  console.log("Automation gate off (set RUN_AUTOMATION=1 or RUN_FE_BE_E2E=1)");
  process.exit(0);
}

const cfg = loadAutomationConfig(process.argv.slice(2));
const summary = await runAutomationSuite(cfg);
const failOnSkip =
  cfg.scope === "full" ||
  cfg.scope === "regression" ||
  process.env.AUTOMATION_NO_SKIP === "1";
process.exit(summary.failed > 0 || (failOnSkip && summary.skipped > 0) ? 1 : 0);
