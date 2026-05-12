/**
 * Slice D — StockAdjustmentCreate: lô nguồn (sourceBatchId) cho điều chỉnh âm.
 *
 * Run (full stack):
 *   cross-env RUN_AUTOMATION=1 BASE_URL=http://127.0.0.1:5173 API_BASE_URL=http://127.0.0.1:8080 \
 *     ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 \
 *     npm run e2e:slice-d
 */
import { By, until, Select, Key } from "selenium-webdriver";

function caseRow(name, status, detail = {}) {
  return { case: name, status, ...detail };
}

async function waitToastContains(driver, text, timeout = 8000) {
  await driver.wait(
    until.elementLocated(By.xpath(`//*[contains(@data-sonner-toast,'') and contains(., "${text}")]`)),
    timeout,
  );
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

async function setNumberInput(driver, element, value) {
  await element.click();
  await element.sendKeys(Key.chord(Key.CONTROL, "a"));
  await element.sendKeys(Key.BACK_SPACE);
  await element.sendKeys(String(value));
}

/** @param {import('../helpers/api.mjs').createApiHelper} api */
async function seedTwoBatchVariant(api) {
  const user = process.env.ADMIN_USERNAME || "admin";
  const pass = process.env.ADMIN_PASSWORD || "admin123";
  const login = await api.authLoginJson(user, pass);
  api.setAccessToken(login.accessToken);

  const categories = await api.fetchJson("/api/categories");
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("Backend cần ít nhất một danh mục để seed SLICE_D");
  }
  const categoryId = categories[0].id;
  const stamp = Date.now();
  const variantCode = `SLICE_D_E2E_${stamp}`;
  const productCode = `SLICE_D_E2E_P_${stamp}`;

  const product = await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code: productCode,
      name: `Slice D E2E ${stamp}`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode,
          variantName: "E2E variant",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice: 15000,
          costPrice: 10000,
          stockQty: 0,
          minStockQty: 0,
          expiryDays: 365,
          isDefault: true,
          active: true,
        },
      ],
    },
  });
  const productId = product.id;
  const variantId = product.variants?.[0]?.id;
  if (!productId || !variantId) {
    throw new Error("Seed product missing id/variants");
  }

  // uq_receipt_variant enforces one variant line per receipt; create two receipts for two batches.
  await api.fetchJson("/api/receipts", {
    method: "POST",
    json: {
      supplierName: "SLICE_D_SEED",
      note: "slice-d selenium seed #1",
      shippingFee: 0,
      vatPercent: 0,
      receiptDate: "2026-01-10T08:00:00",
      items: [
        {
          productId,
          variantId,
          quantity: 10,
          unitCost: 10000,
          discountPercent: 0,
          expiryDateOverride: "2027-01-15",
        },
      ],
    },
  });
  await api.fetchJson("/api/receipts", {
    method: "POST",
    json: {
      supplierName: "SLICE_D_SEED",
      note: "slice-d selenium seed #2",
      shippingFee: 0,
      vatPercent: 0,
      receiptDate: "2026-01-11T08:00:00",
      items: [
        {
          productId,
          variantId,
          quantity: 20,
          unitCost: 10000,
          discountPercent: 0,
          expiryDateOverride: "2027-06-15",
        },
      ],
    },
  });

  const proj = await api.fetchJson(`/api/inventory/projections/${variantId}`);
  const batches = Array.isArray(proj.byBatch) ? proj.byBatch : [];
  if (batches.length < 2) {
    throw new Error(`Expected 2 batches after receipt, got ${batches.length}`);
  }
  batches.sort((a, b) => String(a.expiryDate || "").localeCompare(String(b.expiryDate || "")));
  const batchA = batches[0];
  const batchB = batches[1];
  return {
    variantCode,
    variantId,
    batchAId: batchA.batchId,
    batchBId: batchB.batchId,
    onHand: Number(proj.onHand ?? 0),
  };
}

export default {
  name: "Slice D — stock adjustment source batch (admin)",
  tags: ["slice-d", "admin", "p5-inventory"],
  order: 52,
  /**
   * @param {import('selenium-webdriver').WebDriver} driver
   * @param {import('../runner.mjs').any} ctx
   */
  async run(driver, ctx) {
    const { config, api, auth } = ctx;
    const caseResults = [];
    /** @type {{ variantCode: string, batchAId: number, batchBId: number, onHand: number } | null} */
    let seed;
    try {
      seed = await seedTwoBatchVariant(api);
    } catch (e) {
      return {
        outcome: "fail",
        reason: `Seed failed: ${e?.message || e}`,
        caseResults: [caseRow("seed_two_batch_variant", "FAIL", { reason: e?.message || String(e) })],
      };
    }

    await auth.loginAsAdmin(driver, config, {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin123",
    });

    await driver.get(`${config.baseUrl.replace(/\/$/, "")}/admin/stock-adjustments/create`);
    await driver.sleep(400);

    await driver.executeScript(`
      window.__sliceDAdjPosts = [];
      const _f = globalThis.fetch.bind(globalThis);
      globalThis.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const p = _f(input, init);
        try {
          if (String(url).includes("/api/stock-adjustments") && init && init.method === "POST") {
            const body = init.body;
            window.__sliceDAdjPosts.push(typeof body === "string" ? body : String(body));
          }
        } catch (e) {}
        return p;
      };
    `);

    const search = await driver.wait(
      until.elementLocated(By.css('[data-testid="stock-adj-product-search"]')),
      20000,
    );
    await search.clear();
    await search.sendKeys(seed.variantCode);
    await driver.sleep(900);

    const sug = await driver.findElements(By.css('[data-testid="stock-adj-search-suggestions"] li button'));
    if (sug.length === 0) {
      return { outcome: "fail", reason: "No search suggestions for seeded variant" };
    }
    await sug[0].click();
    await driver.sleep(400);

    const reasonSel = await driver.findElement(
      By.xpath("//label[contains(.,'Lý do')]/following-sibling::select"),
    );
    await new Select(reasonSel).selectByValue("DAMAGED");

    const actualInput = await driver.wait(
      until.elementLocated(By.css('[data-testid="stock-adj-line-actual-qty"]')),
      10000,
    );
    const target = seed.onHand - 5;
    await setNumberInput(driver, actualInput, target);
    const uiState = await driver.executeScript(
      `
        const reasonSel = document.querySelector('label + select');
        const qtyInput = document.querySelector('[data-testid="stock-adj-line-actual-qty"]');
        const diffEl = document.querySelector('tbody tr td:nth-child(4) span');
        return {
          reasonValue: reasonSel ? reasonSel.value : null,
          actualQty: qtyInput ? qtyInput.value : null,
          diffText: diffEl ? diffEl.textContent : null,
        };
      `,
    );
    if (uiState.reasonValue !== "DAMAGED" || Number(uiState.actualQty) !== target) {
      return {
        outcome: "fail",
        reason: `unexpected ui state before batch select: ${JSON.stringify(uiState)}`,
        caseResults,
      };
    }

    const batchSelect = await driver.wait(
      until.elementLocated(By.css('[data-testid^="stock-adj-batch-select-"]')),
      30000,
    );
    await driver.wait(until.elementIsVisible(batchSelect), 10000);
    caseResults.push(caseRow("stock_adjustment_batch_dropdown_visible", "PASS"));

    const opts = await batchSelect.findElements(By.css("option"));
    if (opts.length < 2) {
      caseResults.push(caseRow("stock_adjustment_selects_source_batch", "FAIL", { reason: "Batch dropdown missing options" }));
      return { outcome: "fail", reason: "Batch dropdown missing options", caseResults };
    }

    // Negative + required reason + no batch must be blocked.
    await waitToastsClear(driver, 12000);
    const confirmOpenMissing = await driver.findElement(By.css('[data-testid="stock-adj-confirm-open"]'));
    await confirmOpenMissing.click();
    await driver.sleep(300);
    const confirmMissing = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(.,'Xác nhận điều chỉnh')]")),
      8000,
    );
    await confirmMissing.click();
    await waitToastContains(driver, "Vui lòng chọn lô nguồn cho dòng điều chỉnh âm.");
    caseResults.push(caseRow("stock_adjustment_missing_batch_blocked", "PASS"));

    // Over-remaining for selected batch must be blocked.
    await new Select(batchSelect).selectByValue(String(seed.batchAId));
    const overTarget = seed.onHand - 11;
    const actualInputOver = await driver.findElement(By.css('[data-testid="stock-adj-line-actual-qty"]'));
    await setNumberInput(driver, actualInputOver, overTarget);
    await waitToastsClear(driver, 12000);
    const confirmOpenOver = await driver.findElement(By.css('[data-testid="stock-adj-confirm-open"]'));
    await confirmOpenOver.click();
    await driver.sleep(300);
    const confirmOver = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(.,'Xác nhận điều chỉnh')]")),
      8000,
    );
    await confirmOver.click();
    await waitToastContains(driver, "Số lượng giảm vượt quá tồn còn lại của lô đã chọn.");
    caseResults.push(caseRow("stock_adjustment_over_remaining_blocked", "PASS"));

    // This screen has immutable line variant; clear-on-change is represented by remove/add flow.
    caseResults.push(caseRow("stock_adjustment_variant_change_clears_batch", "SKIPPED_WITH_REASON", {
      reason: "StockAdjustmentCreate has immutable variant per row; no inline variant switch control.",
    }));

    // Positive flow clears source batch by design.
    const reasonSel2 = await driver.findElement(
      By.xpath("//label[contains(.,'Lý do')]/following-sibling::select"),
    );
    await new Select(reasonSel2).selectByValue("OTHER_MISC");
    const actualInputPos = await driver.findElement(By.css('[data-testid="stock-adj-line-actual-qty"]'));
    await setNumberInput(driver, actualInputPos, seed.onHand + 1);
    const batchSelectPos = await driver.findElements(By.css('[data-testid^="stock-adj-batch-select-"]'));
    if (batchSelectPos.length > 0) {
      caseResults.push(caseRow("stock_adjustment_positive_quantity_clears_batch", "FAIL", {
        reason: "batch selector still visible on positive line",
      }));
      return { outcome: "fail", reason: "source batch was not cleared on positive adjustment", caseResults };
    }
    caseResults.push(caseRow("stock_adjustment_positive_quantity_clears_batch", "PASS"));

    // Return to batch-required negative and select source batch for final submit.
    await new Select(reasonSel2).selectByValue("DAMAGED");
    const actualInputFinal = await driver.findElement(By.css('[data-testid="stock-adj-line-actual-qty"]'));
    await setNumberInput(driver, actualInputFinal, target);
    const batchSelectFinal = await driver.wait(
      until.elementLocated(By.css('[data-testid^="stock-adj-batch-select-"]')),
      15000,
    );
    await new Select(batchSelectFinal).selectByValue(String(seed.batchAId));
    caseResults.push(caseRow("stock_adjustment_selects_source_batch", "PASS"));

    await waitToastsClear(driver, 12000);
    const confirmOpen = await driver.findElement(By.css('[data-testid="stock-adj-confirm-open"]'));
    await confirmOpen.click();
    await driver.sleep(300);

    const confirmBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(.,'Xác nhận điều chỉnh')]")),
      8000,
    );
    await confirmBtn.click();

    await driver.sleep(2000);

    const payloads = await driver.executeScript(`return window.__sliceDAdjPosts || [];`);
    if (!Array.isArray(payloads) || payloads.length === 0) {
      return { outcome: "fail", reason: "No intercepted POST /api/stock-adjustments body" };
    }
    /** @type {Record<string, unknown>} */
    let parsed;
    try {
      parsed = JSON.parse(String(payloads[payloads.length - 1]));
    } catch {
      return { outcome: "fail", reason: "POST body not JSON" };
    }
    const items = parsed.items;
    if (!Array.isArray(items) || !items[0]) {
      return { outcome: "fail", reason: "Payload missing items" };
    }
    const first = items[0];
    if (Number(first.sourceBatchId) !== Number(seed.batchAId)) {
      caseResults.push(caseRow("stock_adjustment_payload_contains_sourceBatchId", "FAIL", {
        expected: seed.batchAId,
        got: first.sourceBatchId,
      }));
      return {
        outcome: "fail",
        reason: `sourceBatchId mismatch: expected ${seed.batchAId}, got ${first.sourceBatchId}`,
        caseResults,
      };
    }
    caseResults.push(caseRow("stock_adjustment_payload_contains_sourceBatchId", "PASS", {
      sourceBatchId: first.sourceBatchId,
      variantId: first.variantId,
      actualQty: first.actualQty,
    }));
    if (Number(first.actualQty) !== target) {
      return { outcome: "fail", reason: `actualQty mismatch: expected ${target}, got ${first.actualQty}`, caseResults };
    }

    const projAfter = await api.fetchJson(`/api/inventory/projections/${encodeURIComponent(String(seed.variantId))}`);
    const byAfter = Array.isArray(projAfter.byBatch) ? projAfter.byBatch : [];
    const a = byAfter.find((b) => Number(b.batchId) === Number(seed.batchAId));
    const b = byAfter.find((x) => Number(x.batchId) === Number(seed.batchBId));
    if (!a || !b) {
      return { outcome: "fail", reason: "Could not find batches after confirm", caseResults };
    }
    if (Number(a.qty) !== 5) {
      return { outcome: "fail", reason: `Batch A remaining expected 5, got ${a.qty}`, caseResults };
    }
    if (Number(b.qty) !== 20) {
      return { outcome: "fail", reason: `Batch B should be unchanged 20, got ${b.qty}`, caseResults };
    }
    const sum = byAfter.reduce((s, x) => s + Number(x.qty || 0), 0);
    if (sum !== Number(projAfter.onHand)) {
      return { outcome: "fail", reason: `Invariant: onHand ${projAfter.onHand} vs sum batches ${sum}`, caseResults };
    }
    caseResults.push(caseRow("stock_adjustment_backend_error_displayed", "SKIPPED_WITH_REASON", {
      reason: "Not safely triggerable without forcing invalid server state in this run.",
    }));

    return { outcome: "pass", caseResults };
  },
};
