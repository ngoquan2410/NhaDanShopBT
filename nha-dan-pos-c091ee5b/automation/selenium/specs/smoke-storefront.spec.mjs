export default {
  name: "Storefront home loads",
  tags: ["smoke", "storefront"],
  order: 1,
  async run(driver, ctx) {
    const { waitForTitle } = ctx.assert;
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/`);
    await waitForTitle(driver, /Nhã Đan Shop/);
  },
};
