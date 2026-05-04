import { By } from "selenium-webdriver";
import { waitForH1Containing } from "./assertions.mjs";

async function otpGatePresent(driver) {
  const els = await driver.findElements(By.xpath("//*[contains(text(),'Xác thực OTP')]"));
  return els.length > 0;
}

/**
 * Mirrors {@link normalize} in `src/lib/admin-auth.tsx` — session JSON the Provider reads on load.
 */
function sessionFromLoginBody(data) {
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    tokenType: data.tokenType ?? "Bearer",
    expiresAt: Date.now() + Number(data.expiresIn ?? 900) * 1000,
    username: data.username,
    fullName: data.fullName ?? null,
    roles: Array.isArray(data.roles) ? data.roles : Array.from(data.roles ?? []),
    customerId: data.customerId ?? null,
    totpEnabled: Boolean(data.totpEnabled),
  };
}

/**
 * POST /api/auth/login from the Node runner, then seed `nhadan.auth.session.v1` in the browser.
 * React controlled-login form is unreliable under headless Selenium; this matches a real login response.
 */
async function establishBrowserSession(driver, config, username, password) {
  const apiOrigin = config.apiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${apiOrigin}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`/api/auth/login HTTP ${res.status}: ${data?.detail || data?.message || res.statusText || ""}`);
  }
  if (data?.totpRequired) {
    const err = new Error("TOTP_REQUIRED");
    err.code = "TOTP_REQUIRED";
    throw err;
  }
  const session = sessionFromLoginBody(data);
  const origin = config.baseUrl.replace(/\/$/, "");
  await driver.get(`${origin}/`);
  await driver.executeScript(
    `try { localStorage.setItem("nhadan.auth.session.v1", arguments[0]); } catch (e) { throw e; }`,
    JSON.stringify(session),
  );
}

/**
 * Login via storefront `/login` form (same-origin `/api` proxy).
 *
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {{ baseUrl: string, apiBaseUrl: string }} config
 * @param {{ username: string, password: string, nextPath?: string }} creds
 */
export async function loginViaUi(driver, config, creds) {
  const origin = config.baseUrl.replace(/\/$/, "");
  const next = creds.nextPath ?? "/account";
  await establishBrowserSession(driver, config, creds.username, creds.password);
  const path = next.startsWith("/") ? next : `/${next}`;
  await driver.get(`${origin}${path}`);
  await driver.sleep(600);
  if (await otpGatePresent(driver)) {
    const err = new Error("TOTP_REQUIRED");
    err.code = "TOTP_REQUIRED";
    throw err;
  }
  const url = await driver.getCurrentUrl();
  if (url.includes("/login")) {
    throw new Error("Still on login after session seed — guard or session shape mismatch");
  }
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {{ baseUrl: string, apiBaseUrl: string }} config
 */
export async function loginAsAdmin(driver, config, creds) {
  const origin = config.baseUrl.replace(/\/$/, "");
  await establishBrowserSession(driver, config, creds.username, creds.password);
  await driver.get(`${origin}/admin`);
  await waitForH1Containing(driver, "Dashboard", 25000);
}

/**
 * Same as storefront login helper with default post-login `/account`.
 */
export async function loginAsCustomer(driver, config, creds) {
  await loginViaUi(driver, config, {
    username: creds.username,
    password: creds.password,
    nextPath: creds.nextPath ?? "/account",
  });
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 */
export async function logoutViaUiIfVisible(driver) {
  try {
    const els = await driver.findElements(By.xpath("//button[contains(., 'Đăng xuất')]"));
    if (els.length === 0) return;
    await els[0].click();
    await driver.sleep(500);
  } catch {
    /* ignore */
  }
}
