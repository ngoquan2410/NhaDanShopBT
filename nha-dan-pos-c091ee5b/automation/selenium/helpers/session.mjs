/**
 * Clear cookies + web storage on the current origin (navigate to base first).
 */
export async function resetBrowserSession(driver, baseUrl) {
  const origin = baseUrl.replace(/\/$/, "");
  try {
    await driver.get(`${origin}/`);
  } catch (e) {
    // Retry once after slow Vite/chromium cold start (renderer timeout).
    await new Promise((r) => setTimeout(r, 2000));
    await driver.get(`${origin}/`);
  }
  await driver.manage().deleteAllCookies();
  await driver.executeScript(`
    try {
      window.localStorage?.clear?.();
      window.sessionStorage?.clear?.();
    } catch (e) {}
  `);
}
