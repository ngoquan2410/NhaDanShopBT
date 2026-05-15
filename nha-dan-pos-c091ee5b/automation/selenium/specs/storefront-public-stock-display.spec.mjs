import { By, until } from "selenium-webdriver";

const CASE_ID = "storefront_does_not_show_undefined_stock";

function cr(caseId, outcome, extra = {}) {
  return { caseId, outcome, ...extra };
}

function assertNoBadStockText(driver, label) {
  return driver.executeScript(
    `
    const t = (document.body && document.body.innerText) || "";
    const bad = /Còn\\s*undefined|undefined/i.test(t);
    return { ok: !bad, label: ${JSON.stringify(label)}, sample: t.slice(0, 4000) };
  `,
  );
}

export default {
  name: "Storefront: no undefined public stock copy",
  tags: ["storefront-public-stock-display"],
  order: 48,
  /** @param {import('selenium-webdriver').WebDriver} driver */
  async run(driver, ctx) {
    const { config, assert } = ctx;
    const origin = config.baseUrl.replace(/\/$/, "");
    const caseResults = [];

    const check = async (path, step) => {
      await driver.get(`${origin}${path}`);
      await driver.sleep(800);
      const meta = await assertNoBadStockText(driver, step);
      if (!meta?.ok) {
        throw new Error(`${step}: page text contains undefined stock pattern`);
      }
    };

    try {
      await check("/", "home");
      await check("/products", "products");
      const cards = await driver.findElements(By.css('[data-testid="storefront-product-card"]'));
      if (cards.length === 0) {
        caseResults.push(cr(CASE_ID, "fail", { error: "No product cards on /products" }));
        return { outcome: "fail", reason: "No cards", caseResults };
      }
      await cards[0].click();
      await assert.waitForUrlContains(driver, "/products/", 25000);
      await driver.sleep(600);
      const metaDetail = await assertNoBadStockText(driver, "product-detail");
      if (!metaDetail?.ok) {
        throw new Error("product-detail: bad stock text");
      }

      const addBtns = await driver.findElements(By.css('[data-testid="storefront-add-cart"]'));
      let clicked = false;
      for (const b of addBtns) {
        if (await b.isDisplayed()) {
          const tx = await b.getText();
          if (tx.includes("Thêm")) {
            await b.click();
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) {
        throw new Error("No visible add-to-cart");
      }

      caseResults.push(cr(CASE_ID, "pass"));
      return { caseResults };
    } catch (e) {
      caseResults.push(cr(CASE_ID, "fail", { error: e?.message || String(e) }));
      return { outcome: "fail", reason: e?.message || String(e), caseResults };
    }
  },
};
