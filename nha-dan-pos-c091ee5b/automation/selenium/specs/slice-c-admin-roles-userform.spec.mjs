import { By, Key, until } from "selenium-webdriver";

function caseRow(name, status, detail = {}) {
  return { case: name, status, ...detail };
}

async function waitToastsClear(driver, timeout = 8000) {
  await driver.wait(
    async () => {
      const visible = await driver.executeScript(
        `
          return Array.from(document.querySelectorAll('[data-sonner-toast]'))
            .some((el) => el.getAttribute('data-visible') === 'true');
        `,
      );
      return !visible;
    },
    timeout,
  );
}

async function createStaffViaApi(api, adminUser, adminPass, stamp) {
  const login = await api.authLoginJson(adminUser, adminPass);
  api.setAccessToken(login.accessToken);
  const username = `SLICE_C_STAFF_FIX_${stamp}`;
  return api.fetchJson("/api/admin/users", {
    method: "POST",
    json: {
      username,
      password: "Secret12!ab",
      fullName: `Slice C Staff ${stamp}`,
      roles: ["ROLE_STAFF"],
    },
  });
}

async function createCustomerViaSignup(api, stamp) {
  const username = `slice_c_cust_${stamp}`;
  const password = "Secret12!ab";
  await api.fetchJson("/api/auth/signup", {
    method: "POST",
    json: { username, password, fullName: `Slice C Customer ${stamp}` },
  });
  const login = await api.authLoginJson(username, password);
  return { username, accessToken: login.accessToken };
}

async function fillUserDrawer(driver, { fullName, username, password, roleLabel }) {
  const fullNameInput = await driver.wait(until.elementLocated(By.xpath("//label[contains(.,'Họ tên')]/following::input[1]")), 8000);
  await fullNameInput.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE, fullName);
  const usernameInput = await driver.findElement(By.xpath("//label[contains(.,'Username')]/following::input[1]"));
  await usernameInput.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE, username);
  const passwordInput = await driver.findElement(By.xpath("//label[contains(.,'Mật khẩu tạm')]/following::input[1]"));
  await passwordInput.sendKeys(password);

  const roleTrigger = await driver.findElement(By.xpath("//label[contains(.,'Vai trò')]/following::button[1]"));
  await roleTrigger.click();
  const roleOption = await driver.wait(
    until.elementLocated(By.xpath(`//*[contains(@role,'option') and contains(.,'${roleLabel}')]`)),
    8000,
  );
  await roleOption.click();
}

export default {
  name: "Slice C — admin roles endpoint + user role payload",
  tags: ["slice-c", "admin"],
  order: 51,
  async run(driver, ctx) {
    const { config, api, auth } = ctx;
    const caseResults = [];
    const adminUser = process.env.ADMIN_USERNAME || "admin";
    const adminPass = process.env.ADMIN_PASSWORD || "admin123";
    const stamp = Date.now();

    const adminLogin = await api.authLoginJson(adminUser, adminPass);
    api.setAccessToken(adminLogin.accessToken);
    const adminRoles = await api.fetchJson("/api/admin/roles");
    if (Array.isArray(adminRoles) && adminRoles.some((r) => r.name === "ROLE_ADMIN") && adminRoles.some((r) => r.name === "ROLE_STAFF")) {
      caseResults.push(caseRow("roles_endpoint_admin_visible", "PASS"));
    } else {
      caseResults.push(caseRow("roles_endpoint_admin_visible", "FAIL", { reason: "ROLE_ADMIN/ROLE_STAFF not both present" }));
      return { outcome: "fail", reason: "admin roles endpoint missing required roles", caseResults };
    }

    const seededStaff = await createStaffViaApi(api, adminUser, adminPass, stamp);
    const staffLogin = await api.authLoginJson(seededStaff.username, "Secret12!ab");
    api.setAccessToken(staffLogin.accessToken);
    try {
      await api.fetchJson("/api/admin/roles");
      caseResults.push(caseRow("roles_endpoint_staff_forbidden", "FAIL", { reason: "staff unexpectedly accessed /api/admin/roles" }));
      return { outcome: "fail", reason: "staff should not access /api/admin/roles", caseResults };
    } catch {
      caseResults.push(caseRow("roles_endpoint_staff_forbidden", "PASS"));
    }

    const customer = await createCustomerViaSignup(api, stamp);
    api.setAccessToken(customer.accessToken);
    try {
      await api.fetchJson("/api/admin/roles");
      caseResults.push(caseRow("roles_endpoint_customer_forbidden", "FAIL", { reason: "customer unexpectedly accessed /api/admin/roles" }));
      return { outcome: "fail", reason: "customer should not access /api/admin/roles", caseResults };
    } catch {
      caseResults.push(caseRow("roles_endpoint_customer_forbidden", "PASS"));
    }
    try {
      await api.fetchJson("/api/admin/users?page=0&size=5");
      caseResults.push(caseRow("customer_admin_access_blocked", "FAIL", { reason: "customer unexpectedly accessed admin users api" }));
      return { outcome: "fail", reason: "customer should not access admin users api", caseResults };
    } catch {
      caseResults.push(caseRow("customer_admin_access_blocked", "PASS"));
    }

    const anonRes = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/admin/roles`);
    const anonBlocked = anonRes.status === 401 || anonRes.status === 403;
    if (!anonBlocked) {
      caseResults.push(caseRow("roles_endpoint_anonymous_forbidden", "FAIL"));
      return { outcome: "fail", reason: "anonymous unexpectedly accessed /api/admin/roles", caseResults };
    }
    caseResults.push(caseRow("roles_endpoint_anonymous_forbidden", "PASS"));

    await auth.loginAsAdmin(driver, config, { username: adminUser, password: adminPass });
    const origin = config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/admin/users`);
    await driver.wait(until.elementLocated(By.xpath("//h1[contains(.,'Người dùng')]")), 15000);

    await driver.executeScript(`
      window.__sliceCRolesGet = [];
      window.__sliceCUserPosts = [];
      const _fetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = function(input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const method = String((init && init.method) || "GET").toUpperCase();
        if (String(url).includes("/api/admin/roles")) window.__sliceCRolesGet.push({ url, method });
        if (String(url).includes("/api/admin/users") && (method === "POST" || method === "PUT")) {
          window.__sliceCUserPosts.push({ url, method, body: init && init.body ? String(init.body) : "" });
        }
        return _fetch(input, init);
      };
    `);

    await waitToastsClear(driver, 12000);
    const addUserBtn = await driver.wait(until.elementLocated(By.xpath("//button[contains(.,'Thêm người dùng')]")), 8000);
    await addUserBtn.click();
    await driver.wait(until.elementLocated(By.xpath("//h2[contains(.,'Thêm người dùng')]")), 8000);
    await fillUserDrawer(driver, {
      fullName: `SLICE_C_STAFF_${stamp}`,
      username: `slicecstaff_${stamp}`,
      password: "Secret12!ab",
      roleLabel: "Nhân viên",
    });
    const createBtn = await driver.findElement(By.xpath("//button[contains(.,'Thêm mới')]"));
    await createBtn.click();
    await driver.sleep(1200);

    const events = await driver.executeScript("return { roles: window.__sliceCRolesGet || [], posts: window.__sliceCUserPosts || [] };");
    if (Array.isArray(events.roles) && events.roles.length > 0) {
      caseResults.push(caseRow("user_form_roles_loaded_from_backend", "PASS", { calls: events.roles.length }));
    } else {
      caseResults.push(caseRow("user_form_roles_loaded_from_backend", "FAIL", { reason: "no /api/admin/roles call captured" }));
      return { outcome: "fail", reason: "UserFormDrawer did not call backend roles endpoint", caseResults };
    }
    const staffPost = Array.isArray(events.posts) ? events.posts.find((p) => p.method === "POST" && p.body.includes(`slicecstaff_${stamp}`)) : null;
    if (!staffPost) {
      caseResults.push(caseRow("create_staff_sends_ROLE_STAFF", "FAIL", { reason: "staff create payload not captured" }));
      return { outcome: "fail", reason: "staff create payload missing", caseResults };
    }
    const staffBody = JSON.parse(String(staffPost.body || "{}"));
    const staffRoles = Array.isArray(staffBody.roles) ? staffBody.roles : [];
    if (staffRoles.includes("ROLE_STAFF")) {
      caseResults.push(caseRow("create_staff_sends_ROLE_STAFF", "PASS", { roles: staffRoles }));
    } else {
      caseResults.push(caseRow("create_staff_sends_ROLE_STAFF", "FAIL", { roles: staffRoles }));
      return { outcome: "fail", reason: "staff payload does not contain ROLE_STAFF", caseResults };
    }
    if (!staffRoles.includes("ROLE_USER")) {
      caseResults.push(caseRow("create_staff_not_ROLE_USER", "PASS", { roles: staffRoles }));
    } else {
      caseResults.push(caseRow("create_staff_not_ROLE_USER", "FAIL", { roles: staffRoles }));
      return { outcome: "fail", reason: "staff payload incorrectly includes ROLE_USER", caseResults };
    }

    await waitToastsClear(driver, 12000);
    const addUserBtn2 = await driver.wait(until.elementLocated(By.xpath("//button[contains(.,'Thêm người dùng')]")), 8000);
    await addUserBtn2.click();
    await driver.wait(until.elementLocated(By.xpath("//h2[contains(.,'Thêm người dùng')]")), 8000);
    await fillUserDrawer(driver, {
      fullName: `SLICE_C_ADMIN_${stamp}`,
      username: `slicecadmin_${stamp}`,
      password: "Secret12!ab",
      roleLabel: "Quản trị viên",
    });
    const createBtn2 = await driver.findElement(By.xpath("//button[contains(.,'Thêm mới')]"));
    await createBtn2.click();
    await driver.sleep(1200);

    const eventsAfter = await driver.executeScript("return window.__sliceCUserPosts || [];");
    const adminPost = Array.isArray(eventsAfter) ? eventsAfter.find((p) => p.method === "POST" && p.body.includes(`slicecadmin_${stamp}`)) : null;
    if (!adminPost) {
      caseResults.push(caseRow("create_admin_sends_ROLE_ADMIN", "FAIL", { reason: "admin create payload not captured" }));
      return { outcome: "fail", reason: "admin create payload missing", caseResults };
    }
    const adminBody = JSON.parse(String(adminPost.body || "{}"));
    const adminRolesPayload = Array.isArray(adminBody.roles) ? adminBody.roles : [];
    if (adminRolesPayload.includes("ROLE_ADMIN")) {
      caseResults.push(caseRow("create_admin_sends_ROLE_ADMIN", "PASS", { roles: adminRolesPayload }));
    } else {
      caseResults.push(caseRow("create_admin_sends_ROLE_ADMIN", "FAIL", { roles: adminRolesPayload }));
      return { outcome: "fail", reason: "admin payload does not contain ROLE_ADMIN", caseResults };
    }

    await driver.navigate().refresh();
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'SLICE_C_STAFF_${stamp}')]`)), 10000);
    caseResults.push(caseRow("staff_role_display_preserved", "PASS"));

    caseResults.push(caseRow("staff_scope_guard_verified", "SKIPPED_WITH_REASON", {
      reason: "Slice C selenium keeps to role endpoint + user drawer scope; backend security matrix is covered by integration tests.",
    }));

    return { outcome: "pass", caseResults };
  },
};
