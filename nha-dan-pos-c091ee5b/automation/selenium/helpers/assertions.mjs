import { By, until } from "selenium-webdriver";

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {(url: string) => boolean} predicate
 * @param {number} [timeoutMs]
 */
export async function waitForUrl(driver, predicate, timeoutMs = 20000) {
  await driver.wait(async () => predicate(await driver.getCurrentUrl()), timeoutMs);
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {string} substring
 * @param {number} [timeoutMs]
 */
export async function waitForUrlContains(driver, substring, timeoutMs = 20000) {
  await waitForUrl(driver, (u) => u.includes(substring), timeoutMs);
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {string} text
 * @param {number} [timeoutMs]
 */
export async function waitForH1Containing(driver, text, timeoutMs = 20000) {
  const xp = `//h1[contains(normalize-space(.), "${text.replace(/"/g, '\\"')}")]`;
  await driver.wait(until.elementLocated(By.xpath(xp)), timeoutMs);
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {RegExp} re
 * @param {number} [timeoutMs]
 */
export async function waitForTitle(driver, re, timeoutMs = 20000) {
  await driver.wait(async () => re.test(await driver.getTitle()), timeoutMs);
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {string} substring
 * @param {number} [timeoutMs]
 */
export async function waitForButtonEnabledContaining(driver, substring, timeoutMs = 120000) {
  const xp = `//button[contains(normalize-space(.), "${substring.replace(/"/g, '\\"')}") and not(@disabled)]`;
  await driver.wait(until.elementLocated(By.xpath(xp)), timeoutMs);
}
