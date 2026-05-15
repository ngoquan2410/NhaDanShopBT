import fs from "node:fs";
import path from "node:path";
import { By } from "selenium-webdriver";

export async function dumpPromoFailureContext(driver, artifactDir, caseId, network = {}) {
  const base = path.join(artifactDir, `promo-${caseId.toLowerCase()}-${Date.now()}`);
  const url = await driver.getCurrentUrl().catch(() => "");
  const localStorageCart = await driver.executeScript("return window.localStorage.getItem('nhadan.cart.v1');").catch(() => null);
  const summaryText = await driver.findElement(By.css("body")).getText().catch(() => "");
  const consoleErrors = await driver.manage().logs().get("browser").catch(() => []);
  const payload = {
    caseId,
    url,
    localStorageCart,
    summaryText,
    network,
    consoleErrors,
  };
  fs.writeFileSync(`${base}.context.json`, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { contextPath: `${base}.context.json` };
}
