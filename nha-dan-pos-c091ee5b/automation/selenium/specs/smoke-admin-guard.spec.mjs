export default {
  name: "Admin redirects unauthenticated users to login",
  tags: ["smoke", "admin"],
  order: 2,
  async run(driver, ctx) {
    const { waitForUrlContains } = ctx.assert;
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/admin`);
    await waitForUrlContains(driver, "/login", 25000);
    const url = await driver.getCurrentUrl();
    if (!url.includes("next=")) {
      throw new Error("Expected login URL to preserve next= redirect target");
    }
  },
};
