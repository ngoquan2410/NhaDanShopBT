import { Builder, Browser, Capability } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

/**
 * @param {{ headed: boolean }} opts
 */
export async function createDriver(opts) {
  const ch = new chrome.Options();
  if (!opts.headed) {
    ch.addArguments("--headless=new", "--window-size=1400,900");
  }
  // Stabilize CI / Windows: avoid renderer hangs and shared-memory issues.
  ch.addArguments(
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--window-size=1400,900",
  );
  ch.set(Capability.ACCEPT_INSECURE_TLS_CERTS, true);
  ch.set(Capability.LOGGING_PREFS, { browser: "ALL" });

  const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(ch).build();

  await driver.manage().setTimeouts({
    implicit: 2500,
    pageLoad: 180000,
    script: 120000,
  });

  return driver;
}
