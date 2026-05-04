/**
 * Clear cookies + web storage on the current origin (navigate to base first).
 */
export async function resetBrowserSession(driver, baseUrl) {
  const origin = baseUrl.replace(/\/$/, "");
  await driver.get(`${origin}/`);
  await driver.manage().deleteAllCookies();
  await driver.executeScript(`
    try {
      window.localStorage?.clear?.();
      window.sessionStorage?.clear?.();
    } catch (e) {}
  `);
}
