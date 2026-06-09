import fs from "node:fs";
import path from "node:path";
import { By } from "selenium-webdriver";

const CASE_ID = "storefront_public_available_qty_visible";

function cr(caseId, outcome, extra = {}) {
  return { caseId, outcome, ...extra };
}

/** Mirrors storefront `storefrontAvailabilityLine` / out-of-stock rules against public JSON rows. */
function expectedAvailabilityText(variant) {
  const qty = variant?.availableQty;
  const status = String(variant?.availabilityStatus ?? "").toUpperCase();
  const oos =
    status === "OUT_OF_STOCK" ||
    (typeof qty === "number" && qty <= 0);
  if (oos) return "Hết hàng";
  if (typeof qty === "number" && qty > 0) {
    return `Còn ${qty} ${String(variant.sellUnit || "cái")}`;
  }
  return "Còn hàng";
}

function defaultVariant(product) {
  const vars = Array.isArray(product?.variants) ? product.variants : [];
  return vars.find((x) => x?.isDefault) || vars[0];
}

export default {
  name: "Storefront: public availableQty visible (full-stack)",
  tags: ["storefront-public-available-qty"],
  order: 49,
  /** @param {import('selenium-webdriver').WebDriver} driver */
  async run(driver, ctx) {
    const { config } = ctx;
    const origin = config.baseUrl.replace(/\/$/, "");
    const api = config.apiBaseUrl.replace(/\/$/, "");
    const caseResults = [];

    try {
      const catalogRes = await fetch(`${api}/api/products?page=0&size=48&sort=name,asc`);
      const catalogText = await catalogRes.text();
      if (!catalogRes.ok) {
        throw new Error(`GET /api/products → HTTP ${catalogRes.status}`);
      }
      const catalogJson = catalogText ? JSON.parse(catalogText) : {};

      fs.mkdirSync(config.artifactDir, { recursive: true });
      const samplePath = path.join(config.artifactDir, "storefront-public-catalog-sample.json");
      fs.writeFileSync(samplePath, `${JSON.stringify(catalogJson, null, 2)}\n`, "utf8");

      const forbiddenKeySnippets = ['"stockQty"', '"remainingQty"', '"costPrice"', '"batchId"', '"receiptId"', '"supplierId"'];
      for (const snip of forbiddenKeySnippets) {
        if (catalogText.includes(snip)) {
          throw new Error(`Public catalog response contains forbidden substring ${snip}`);
        }
      }

      const content = Array.isArray(catalogJson.content) ? catalogJson.content : [];
      let sawAvailableQtyKey = false;
      let pickQty = 0;
      let pickUnit = "cái";
      let pickProductId = "";
      for (const p of content) {
        for (const v of Array.isArray(p.variants) ? p.variants : []) {
          if (Object.prototype.hasOwnProperty.call(v, "availableQty")) sawAvailableQtyKey = true;
          const q = v?.availableQty;
          if (typeof q === "number" && q > 0 && !pickProductId) {
            pickQty = q;
            pickUnit = String(v.sellUnit || "cái");
            pickProductId = String(p.id);
          }
        }
      }
      if (!sawAvailableQtyKey) {
        throw new Error("Public catalog variants missing availableQty field");
      }

      const heroProducts = content.slice(0, 5);
      await driver.get(`${origin}/`);
      await driver.sleep(1200);
      const heroEls = await driver.findElements(By.css('[data-testid="storefront-hero-availability"]'));
      if (heroEls.length === 0) throw new Error("No hero availability nodes on home");
      for (let i = 0; i < Math.min(heroProducts.length, heroEls.length); i++) {
        const dv = defaultVariant(heroProducts[i]);
        if (!dv) continue;
        const want = expectedAvailabilityText(dv);
        const got = String(await heroEls[i].getAttribute("textContent")).trim();
        if (got !== want) {
          throw new Error(`Hero slide ${i}: want "${want}" got "${got}" (API vs UI)`);
        }
      }

      const bodyHome = await driver.executeScript("return document.body && document.body.innerText || '';");
      if (String(bodyHome).toLowerCase().includes("undefined")) {
        throw new Error("Home page contains undefined");
      }

      await driver.get(`${origin}/products`);
      await driver.sleep(1000);
      const bodyProducts = await driver.executeScript("return document.body && document.body.innerText || '';");
      if (String(bodyProducts).toLowerCase().includes("undefined")) {
        throw new Error("/products page contains undefined");
      }
      if (pickProductId) {
        const reQty = new RegExp(
          `Còn\\s*${String(pickQty).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${String(pickUnit).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          "i",
        );
        if (!reQty.test(String(bodyProducts))) {
          throw new Error(`/products: expected visible line Còn ${pickQty} ${pickUnit} for seeded in-stock product`);
        }
      }

      if (pickProductId) {
        await driver.get(`${origin}/products/${pickProductId}`);
        await driver.sleep(900);
        const bodyDetail = await driver.executeScript("return document.body && document.body.innerText || '';");
        if (String(bodyDetail).toLowerCase().includes("undefined")) {
          throw new Error("Product detail page contains undefined");
        }
        const reQty = new RegExp(
          `Còn\\s*${String(pickQty).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*${String(pickUnit).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          "i",
        );
        if (!reQty.test(String(bodyDetail))) {
          throw new Error(`Detail: expected Còn ${pickQty} ${pickUnit}`);
        }
      }

      caseResults.push(cr(CASE_ID, "pass", { samplePath, pickProductId: pickProductId || null, pickQty: pickQty || null }));
      return { caseResults };
    } catch (e) {
      caseResults.push(cr(CASE_ID, "fail", { error: e?.message || String(e) }));
      return { outcome: "fail", reason: e?.message || String(e), caseResults };
    }
  },
};
