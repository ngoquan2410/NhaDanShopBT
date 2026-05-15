import fs from "node:fs";
import path from "node:path";
import { By } from "selenium-webdriver";

const CASE_ID = "storefront_availability_color_consistent";

function cr(caseId, outcome, extra = {}) {
  return { caseId, outcome, ...extra };
}

function defaultVariant(p) {
  const vars = Array.isArray(p?.variants) ? p.variants : [];
  return vars.find((x) => x?.isDefault) || vars[0];
}

/** Align with `storefrontAvailabilityUi` / `storefrontAvailabilityTextClass` (tone → token). */
function expectedToneFromVariant(v) {
  if (!v) return "ok";
  const q = v?.availableQty;
  const st = String(v?.availabilityStatus ?? "").toUpperCase();
  if (v.available === false || v.isSellable === false) return "out";
  if (st === "OUT_OF_STOCK") return "out";
  if (typeof q === "number" && q <= 0) return "out";
  if (typeof q === "number" && q > 0) {
    return st === "LOW_STOCK" ? "warn" : "ok";
  }
  return "ok";
}

function requiredClassForTone(tone) {
  if (tone === "out") return "text-danger";
  if (tone === "warn") return "text-warning";
  return "text-success";
}

async function elHasClass(el, token) {
  const cls = await el.getAttribute("class");
  return typeof cls === "string" && cls.split(/\s+/).includes(token);
}

export default {
  name: "Storefront: availability semantic colors consistent",
  tags: ["storefront-availability-color"],
  order: 50,
  /** @param {import('selenium-webdriver').WebDriver} driver */
  async run(driver, ctx) {
    const { config } = ctx;
    const origin = config.baseUrl.replace(/\/$/, "");
    const api = config.apiBaseUrl.replace(/\/$/, "");
    const caseResults = [];

    try {
      const catalogRes = await fetch(`${api}/api/products?page=0&size=48&sort=name,asc`);
      const catalogText = await catalogRes.text();
      if (!catalogRes.ok) throw new Error(`GET /api/products → HTTP ${catalogRes.status}`);
      const catalogJson = catalogText ? JSON.parse(catalogText) : {};
      const content = Array.isArray(catalogJson.content) ? catalogJson.content : [];

      fs.mkdirSync(config.artifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(config.artifactDir, "storefront-availability-color-catalog-sample.json"),
        `${JSON.stringify(catalogJson, null, 2)}\n`,
        "utf8",
      );

      await driver.get(`${origin}/`);
      await driver.sleep(1200);

      const heroEls = await driver.findElements(By.css('[data-testid="storefront-hero-availability"]'));
      if (heroEls.length === 0) throw new Error("Hero availability not found");

      const heroProducts = content.slice(0, 5);
      for (let i = 0; i < Math.min(heroEls.length, heroProducts.length); i++) {
        const dv = defaultVariant(heroProducts[i]);
        const tone = expectedToneFromVariant(dv);
        const want = requiredClassForTone(tone);
        if (!(await elHasClass(heroEls[i], want))) {
          const got = await heroEls[i].getAttribute("class");
          throw new Error(`Hero slide ${i}: expected class token ${want}, classes="${got}"`);
        }
      }

      const firstOnPage = content[0];
      if (!firstOnPage) throw new Error("Empty catalog");
      const firstCardDv = defaultVariant(firstOnPage);
      const firstCardClass = requiredClassForTone(expectedToneFromVariant(firstCardDv));

      await driver.get(`${origin}/products`);
      await driver.sleep(1000);
      const cardAvail = await driver.findElement(
        By.css('[data-testid="storefront-product-card"] [data-testid="storefront-product-card-availability"]'),
      );
      if (!(await elHasClass(cardAvail, firstCardClass))) {
        const got = await cardAvail.getAttribute("class");
        throw new Error(`First product card availability: expected ${firstCardClass}, got "${got}"`);
      }

      const firstInStock = content.find((p) => {
        const dv = defaultVariant(p);
        return dv && typeof dv.availableQty === "number" && dv.availableQty > 0;
      });
      if (!firstInStock) {
        throw new Error("No in-stock product in catalog for detail color check");
      }
      const firstInStockDv = defaultVariant(firstInStock);
      const inStockClass = requiredClassForTone(expectedToneFromVariant(firstInStockDv));

      const oos = content.find((p) => {
        const dv = defaultVariant(p);
        return dv && expectedToneFromVariant(dv) === "out";
      });
      if (oos) {
        await driver.get(`${origin}/products`);
        await driver.sleep(1200);
        const oosEls = await driver.findElements(By.css('[data-testid="storefront-product-card-availability"]'));
        let checked = false;
        for (const el of oosEls) {
          const t = (await el.getText()).trim();
          if (t === "Hết hàng") {
            if (!(await elHasClass(el, "text-danger"))) {
              const got = await el.getAttribute("class");
              throw new Error(`Out-of-stock card: expected text-danger, classes="${got}"`);
            }
            checked = true;
            break;
          }
        }
        if (!checked) {
          throw new Error("Catalog has OOS product but no Hết hàng card visible on /products page 0");
        }
      }

      await driver.get(`${origin}/products/${firstInStock.id}`);
      await driver.sleep(900);
      const detailEl = await driver.findElement(By.css('[data-testid="storefront-product-detail-availability"]'));
      if (!(await elHasClass(detailEl, inStockClass))) {
        const got = await detailEl.getAttribute("class");
        throw new Error(`Detail availability: expected ${inStockClass}, got "${got}"`);
      }

      const bodyTxt = await driver.executeScript("return document.body && document.body.innerText || '';");
      if (String(bodyTxt).toLowerCase().includes("undefined")) {
        throw new Error("Page contains undefined");
      }

      caseResults.push(cr(CASE_ID, "pass", { detailProductId: String(firstInStock.id) }));
      return { caseResults };
    } catch (e) {
      caseResults.push(cr(CASE_ID, "fail", { error: e?.message || String(e) }));
      return { outcome: "fail", reason: e?.message || String(e), caseResults };
    }
  },
};
