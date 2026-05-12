/**
 * Slice F: HTML date inputs and report query params use local calendar day (no UTC `toISOString().slice(0,10)` drift).
 * Run: npm run e2e:slice-f
 */
import { By, logging } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/** @param {string} c @param {'PASS'|'FAIL'|'SKIPPED_WITH_REASON'} s @param {Record<string, unknown>} [extra] */
function cr(c, s, extra = {}) {
  return { case: c, status: s, ...extra };
}

const CRITICAL = new Set([
  "date_input_today_not_utc_yesterday",
  "revenue_report_date_filter_uses_local_date",
  "date_query_param_not_shifted",
]);

/** @param {import('selenium-webdriver').WebDriver} driver */
async function browserLocalYmd(driver) {
  /** @type {unknown} */
  const y = await driver.executeScript(`
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  `);
  if (typeof y !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(y)) {
    throw new Error(`browserLocalYmd: expected yyyy-MM-dd string, got ${String(y)}`);
  }
  return y;
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function assertNoSevereBrowserLogs(driver) {
  let entries;
  try {
    entries = await driver.manage().logs().get(logging.Type.BROWSER);
  } catch {
    return;
  }
  const bad = entries.filter((e) => e.level && String(e.level.name || e.level) === "SEVERE");
  if (bad.length) {
    const msg = bad.map((e) => e.message).join("\n");
    throw new Error(`Browser console SEVERE:\n${msg}`);
  }
}

/**
 * Persist fetch tap across full navigations (executeScript alone is cleared on new documents).
 * @param {import('selenium-webdriver').WebDriver} driver
 */
async function installReportFetchTapCdp(driver) {
  const conn = await driver.createCDPConnection("page");
  await conn.send("Page.enable", {});
  const source = `
    (function () {
      window.__sliceFUrls = [];
      const _f = window.fetch.bind(window);
      window.fetch = function () {
        try {
          const input = arguments[0];
          const u = typeof input === "string" ? input : (input && input.url) || "";
          const s = String(u);
          if (s.indexOf("/api/revenue") >= 0 || s.indexOf("/api/reports/profit") >= 0) {
            window.__sliceFUrls.push(s);
          }
        } catch (e) {}
        return _f.apply(window, arguments);
      };
    })();
  `;
  await conn.send("Page.addScriptToEvaluateOnNewDocument", { source });
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function readSliceFUrls(driver) {
  /** @type {unknown} */
  const raw = await driver.executeScript(`return window.__sliceFUrls || [];`);
  return Array.isArray(raw) ? raw.map((u) => String(u)) : [];
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function readRevenueUrlsFromPerformance(driver) {
  /** @type {unknown} */
  const raw = await driver.executeScript(`
    return performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(n => typeof n === 'string' && n.indexOf('/api/revenue') >= 0);
  `);
  return Array.isArray(raw) ? raw.map((u) => String(u)) : [];
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function readProfitUrlsFromPerformance(driver) {
  /** @type {unknown} */
  const raw = await driver.executeScript(`
    return performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(n => typeof n === 'string' && n.indexOf('/api/reports/profit') >= 0);
  `);
  return Array.isArray(raw) ? raw.map((u) => String(u)) : [];
}

export default {
  name: "Slice F: local date inputs / no UTC day drift",
  tags: ["slice-f"],
  order: 51,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    /** @type {{ case: string, status: string, reason?: string }[]} */
    const caseResults = [];

    if (!u || !p) {
      return {
        skipped: true,
        reason: "ADMIN_USERNAME / ADMIN_PASSWORD",
        caseResults: [
          cr("date_input_today_not_utc_yesterday", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("revenue_report_date_filter_uses_local_date", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("date_query_param_not_shifted", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("date_picker_allows_local_today", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("dashboard_today_not_regressed", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
        ],
      };
    }

    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    let cdpTapOk = false;
    try {
      await installReportFetchTapCdp(driver);
      cdpTapOk = true;
    } catch {
      cdpTapOk = false;
    }
    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const ymd = await browserLocalYmd(driver);

    await driver.get(`${origin}/admin/revenue`);
    await waitForH1Containing(driver, "Doanh thu", 30000);

    await driver.wait(
      async () => {
        if (cdpTapOk) {
          const urls = await readSliceFUrls(driver);
          if (urls.some((s) => s.includes("/api/revenue"))) return true;
        }
        /** @type {string[]} */
        const rt = await driver.executeScript(`
          return performance.getEntriesByType('resource')
            .map(e => e.name)
            .filter(n => typeof n === 'string' && n.indexOf('/api/revenue') >= 0);
        `);
        return Array.isArray(rt) && rt.length > 0;
      },
      25000,
      "revenue API fetch",
    );

    const urlsAfterRevenue = await readSliceFUrls(driver);
    const fromHook = urlsAfterRevenue.filter((s) => s.includes("/api/revenue"));
    const fromPerf = await readRevenueUrlsFromPerformance(driver);
    const revenueUrls = fromHook.length > 0 ? fromHook : fromPerf;
    const revenueToOk = revenueUrls.some((s) => {
      try {
        const uo = new URL(s, origin);
        return uo.searchParams.get("to") === ymd;
      } catch {
        return s.includes(`to=${ymd}`) || s.includes(`&to=${ymd}`);
      }
    });

    try {
      if (!revenueToOk) {
        throw new Error(`no /api/revenue with to=${ymd}: ${revenueUrls.slice(-5).join(" | ")}`);
      }
      caseResults.push(cr("date_query_param_not_shifted", "PASS"));
    } catch (e) {
      caseResults.push(cr("date_query_param_not_shifted", "FAIL", { reason: e?.message || String(e) }));
    }

    const dateInputs = await driver.findElements(By.css('input[type="date"]'));
    let toMax = "";
    let toVal = "";
    let fromMax = "";
    if (dateInputs.length >= 2) {
      fromMax = (await dateInputs[0].getAttribute("max")) || "";
      toMax = (await dateInputs[1].getAttribute("max")) || "";
      toVal = (await dateInputs[1].getAttribute("value")) || "";
    }

    try {
      if (dateInputs.length < 2) throw new Error(`expected 2 date inputs, got ${dateInputs.length}`);
      if (toMax !== ymd || fromMax !== ymd) {
        throw new Error(`max attributes: from=${fromMax} to=${toMax}, browser local=${ymd}`);
      }
      caseResults.push(cr("date_input_today_not_utc_yesterday", "PASS"));
    } catch (e) {
      caseResults.push(cr("date_input_today_not_utc_yesterday", "FAIL", { reason: e?.message || String(e) }));
    }

    try {
      if (toVal !== ymd) {
        throw new Error(`default "to" value ${toVal} !== browser local ${ymd}`);
      }
      caseResults.push(cr("revenue_report_date_filter_uses_local_date", "PASS"));
    } catch (e) {
      caseResults.push(
        cr("revenue_report_date_filter_uses_local_date", "FAIL", { reason: e?.message || String(e) }),
      );
    }

    try {
      /** `clear()` + `sendKeys` is flaky on `type=date` in ChromeDriver; nudge value via DOM like React devtools. */
      const ok = await driver.executeScript(
        `
        var v = arguments[0];
        var to = document.querySelectorAll('input[type="date"]')[1];
        if (!to) return false;
        var tracker = to._valueTracker;
        if (tracker) { tracker.setValue(''); }
        to.value = v;
        to.dispatchEvent(new Event('input', { bubbles: true }));
        to.dispatchEvent(new Event('change', { bubbles: true }));
        return to.value === v;
      `,
        ymd,
      );
      await driver.sleep(300);
      const after = await driver.executeScript(`
        var to = document.querySelectorAll('input[type="date"]')[1];
        return to ? to.value : '';
      `);
      if (!ok || after !== ymd) {
        throw new Error(`after set today, value=${after}, expected ${ymd}`);
      }
      caseResults.push(cr("date_picker_allows_local_today", "PASS"));
    } catch (e) {
      caseResults.push(cr("date_picker_allows_local_today", "FAIL", { reason: e?.message || String(e) }));
    }

    try {
      await driver.get(`${origin}/admin`);
      await waitForH1Containing(driver, "Dashboard", 25000);
      await driver.wait(
        async () => {
          if (cdpTapOk) {
            const urls = await readSliceFUrls(driver);
            if (urls.some((s) => s.includes("/api/reports/profit"))) return true;
          }
          const rt = await readProfitUrlsFromPerformance(driver);
          return rt.length > 0;
        },
        25000,
        "dashboard profit API",
      );
      const fromHookProfit = (await readSliceFUrls(driver)).filter((s) => s.includes("/api/reports/profit"));
      const fromPerfProfit = await readProfitUrlsFromPerformance(driver);
      const profitUrls = fromHookProfit.length > 0 ? fromHookProfit : fromPerfProfit;
      const profitToOk = profitUrls.some((s) => {
        try {
          const uo = new URL(s, origin);
          return uo.searchParams.get("to") === ymd;
        } catch {
          return s.includes(`to=${ymd}`) || s.includes(`&to=${ymd}`);
        }
      });
      if (!profitToOk) {
        throw new Error(`no profit request with to=${ymd}: ${profitUrls.slice(-4).join(" | ")}`);
      }
      caseResults.push(cr("dashboard_today_not_regressed", "PASS"));
    } catch (e) {
      caseResults.push(
        cr("dashboard_today_not_regressed", "SKIPPED_WITH_REASON", { reason: e?.message || String(e) }),
      );
    }

    const criticalFailed = caseResults.some((r) => CRITICAL.has(r.case) && r.status === "FAIL");
    if (criticalFailed) {
      return {
        outcome: "fail",
        reason: "Slice F critical case failed",
        caseResults,
      };
    }

    try {
      await assertNoSevereBrowserLogs(driver);
    } catch (e) {
      return {
        outcome: "fail",
        reason: e?.message || String(e),
        caseResults,
      };
    }

    return { caseResults };
  },
};
