export default {
  name: "Admin login reaches dashboard",
  tags: ["smoke", "admin"],
  order: 3,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return {
        skipped: true,
        reason: "Set ADMIN_USERNAME (or ADMIN_EMAIL) and ADMIN_PASSWORD for this scenario",
      };
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
  },
};
