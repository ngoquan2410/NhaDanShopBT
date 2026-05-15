import { By, until } from "selenium-webdriver";

/**
 * SF-1: Product detail (no separate storefront quick-view modal in this repo).
 * Case id kept for plan/traceability — asserts ProductDetail + cart qty.
 */
const CASE_ID = "storefront_product_modal_quantity_visible_and_adds_selected_qty";

function cr(caseId, outcome, extra = {}) {
  return { caseId, outcome, ...extra };
}

export default {
  name: "SF-1 storefront product detail quantity + add-to-cart qty",
  tags: ["storefront-product-quantity"],
  order: 47,
  /** @param {import('selenium-webdriver').WebDriver} driver */
  async run(driver, ctx) {
    const { config, assert } = ctx;
    const origin = config.baseUrl.replace(/\/$/, "");
    const caseResults = [];

    await driver.get(`${origin}/`);
    await driver.executeScript("try { localStorage.removeItem('nhadan.cart.v1'); } catch (e) {}");

    await driver.get(`${origin}/products`);
    await assert.waitForH1Containing(driver, "Tất cả sản phẩm", 35000);

    const cards = await driver.wait(
      until.elementsLocated(By.css('[data-testid="storefront-product-card"]')),
      35000,
    );
    if (cards.length === 0) {
      caseResults.push(cr(CASE_ID, "fail", { error: "No storefront-product-card on /products" }));
      return { outcome: "fail", reason: "No product cards", caseResults };
    }
    await cards[0].click();
    await assert.waitForUrlContains(driver, "/products/", 25000);

    await driver.wait(until.elementLocated(By.css('[data-testid="storefront-product-quantity-section"]')), 25000);
    const bodyAfterOpen = await driver.findElement(By.css("body")).getText();
    if (!bodyAfterOpen.includes("Số lượng")) {
      caseResults.push(cr(CASE_ID, "fail", { error: "Label 'Số lượng' not found in page text" }));
      return { outcome: "fail", reason: "Missing quantity label", caseResults };
    }

    let qtyText = await (await driver.findElement(By.css('[data-testid="storefront-product-quantity-value"]'))).getText();
    if (String(qtyText).trim() !== "1") {
      caseResults.push(cr(CASE_ID, "fail", { error: `Expected visible qty 1, got "${qtyText}"` }));
      return { outcome: "fail", reason: "Default qty not 1", caseResults };
    }

    await driver.findElement(By.css('[data-testid="storefront-product-quantity-increment"]')).click();
    await driver.sleep(350);
    qtyText = await (await driver.findElement(By.css('[data-testid="storefront-product-quantity-value"]'))).getText();
    if (String(qtyText).trim() !== "2") {
      caseResults.push(cr(CASE_ID, "fail", { error: `After increment expected 2, got "${qtyText}"` }));
      return { outcome: "fail", reason: "Increment did not update visible qty", caseResults };
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
      caseResults.push(cr(CASE_ID, "fail", { error: "No visible data-testid=storefront-add-cart button" }));
      return { outcome: "fail", reason: "Add to cart not clickable", caseResults };
    }

    await driver.sleep(500);
    await driver.get(`${origin}/cart`);
    await driver.wait(
      async () => {
        const t = await driver.findElement(By.css("body")).getText();
        return t.includes("Giỏ của bạn") && !t.includes("Giỏ hàng đang trống");
      },
      25000,
    );

    const qtyInput = await driver.wait(
      until.elementLocated(By.css('input[data-testid^="storefront-cart-line-qty-"]')),
      25000,
    );
    const cartVal = await qtyInput.getAttribute("value");
    if (String(cartVal).trim() !== "2") {
      caseResults.push(cr(CASE_ID, "fail", { error: `Cart line input expected value 2, got "${cartVal}"` }));
      return { outcome: "fail", reason: "Cart qty mismatch", caseResults };
    }

    caseResults.push(cr(CASE_ID, "pass"));
    return { caseResults };
  },
};
