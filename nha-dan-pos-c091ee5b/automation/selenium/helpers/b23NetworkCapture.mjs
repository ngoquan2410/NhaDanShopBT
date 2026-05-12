/**
 * B2.3 Selenium: capture `fetch` URLs across full document navigations.
 * `driver.get()` replaces the document — reinstall this tap after every navigation
 * (and after `loginAsAdmin`, which performs `get(/)` + `get(/admin/...)`).
 *
 * Always wraps `window.__b23OriginalFetch` (saved once) so repeated reinstalls do not chain wrappers.
 */

import { By } from "selenium-webdriver";

/**
 * AdminTopbar uses `placeholder*="Tìm"` but lives outside `<main>`.
 * Entity list toolbars + Production recipe filter live inside `<main>`.
 * Production recipes use placeholder "Lọc…" (no "Tìm" substring).
 */
export async function focusEntityListSearchInput(driver) {
  const selectors = ['main input[placeholder*="Tìm"]', 'main input[placeholder*="Lọc"]'];
  for (const sel of selectors) {
    const inputs = await driver.findElements(By.css(sel));
    for (const el of inputs) {
      try {
        if (await el.isDisplayed()) {
          await el.click();
          return el;
        }
      } catch {
        /* next */
      }
    }
  }
  throw new Error(
    'No main-scoped list search input (expected placeholder containing "Tìm" or "Lọc")',
  );
}

/** List pages use ~250–350ms debounced search — wait before asserting on network. */
export async function sleepAfterSearchTyping(driver, ms = 550) {
  await driver.sleep(ms);
}

/** @param {import('selenium-webdriver').WebDriver} driver @param {{ clear?: boolean }} [opts] */
export async function reinstallFetchTap(driver, opts = {}) {
  const clear = opts.clear !== false;
  await driver.executeScript(`
    if (typeof window.__b23OriginalFetch !== "function") {
      window.__b23OriginalFetch = window.fetch.bind(window);
    }
    var _f = window.__b23OriginalFetch;
    ${clear ? "window.__b23FetchUrls = [];" : "window.__b23FetchUrls = window.__b23FetchUrls || [];"}
    window.fetch = function () {
      try {
        var args = arguments;
        var u = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        window.__b23FetchUrls.push(String(u));
      } catch (e) {}
      return _f.apply(window, args);
    };
  `);
}

/** @param {import('selenium-webdriver').WebDriver} driver */
export async function readFetchUrls(driver) {
  const urls = await driver.executeScript("return window.__b23FetchUrls || [];");
  return Array.isArray(urls) ? urls.map(String) : [];
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {{ needle: string; pathPart: string; param: string; ms?: number }} opts
 */
export async function waitForListRequest(driver, opts) {
  const ms = opts.ms ?? 30000;
  const enc = encodeURIComponent(opts.needle);
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const urls = await readFetchUrls(driver);
    const hit = urls.find(
      (u) =>
        u.includes(opts.pathPart) &&
        u.includes(`${opts.param}=`) &&
        (u.includes(opts.needle) || u.includes(enc)),
    );
    if (hit) return hit;
    await driver.sleep(250);
  }
  const urls = await readFetchUrls(driver);
  throw new Error(
    `No fetch matched path=${opts.pathPart} param=${opts.param} needle=${opts.needle}. Last URLs:\n${urls.slice(-24).join("\n")}`,
  );
}
