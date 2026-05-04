import { By, until } from "selenium-webdriver";
import { Select } from "selenium-webdriver";

/**
 * First catalog line with positive stock (public product list).
 *
 * @param {{ fetchJson: (path: string) => Promise<any> }} api
 * @returns {Promise<{ productId: string } | null>}
 */
export async function findSellableProductLine(api) {
  const page = await api.fetchJson("/api/products?page=0&size=50");
  const content = page.content ?? [];
  for (const p of content) {
    const variants = p.variants ?? [];
    for (const v of variants) {
      if (v.isSellable === false) continue;
      const stock = Number(v.stockQty ?? v.stock ?? 0);
      if (stock > 0) {
        return { productId: String(p.id) };
      }
    }
  }
  return null;
}

/**
 * Vietnamese district dropdowns (`AddressSelect`), first real option each level.
 *
 * @param {import('selenium-webdriver').WebDriver} driver
 */
export async function selectFirstFullAddress(driver) {
  const prov = await driver.wait(
    until.elementLocated(By.xpath("//label[contains(.,'Tỉnh / Thành phố')]//following::select[1]")),
    25000,
  );
  await driver.wait(async () => (await prov.findElements(By.css("option"))).length > 1, 25000);
  await new Select(prov).selectByIndex(1);

  const dist = await driver.wait(
    until.elementLocated(By.xpath("//label[contains(.,'Quận / Huyện')]//following::select[1]")),
    25000,
  );
  await driver.wait(async () => (await dist.findElements(By.css("option"))).length > 1, 25000);
  await new Select(dist).selectByIndex(1);

  const ward = await driver.wait(
    until.elementLocated(By.xpath("//label[contains(.,'Phường / Xã')]//following::select[1]")),
    25000,
  );
  await driver.wait(async () => (await ward.findElements(By.css("option"))).length > 1, 25000);
  await new Select(ward).selectByIndex(1);
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {{ name: string; phone: string; street?: string }} customer
 */
export async function fillCheckoutContactAndStreet(driver, customer) {
  const nameIn = await driver.wait(
    until.elementLocated(By.xpath("//label[contains(.,'Họ và tên')]//following::input[1]")),
    15000,
  );
  await nameIn.clear();
  await nameIn.sendKeys(customer.name);

  const phoneIn = await driver.findElement(By.xpath("//label[contains(.,'Số điện thoại')]//following::input[1]"));
  await phoneIn.clear();
  await phoneIn.sendKeys(customer.phone);

  const streetPh = customer.street ?? "1 Đường kiểm thử E2E";
  const streetIn = await driver.wait(
    until.elementLocated(By.xpath("//input[@placeholder='VD: 12 Lê Lợi']")),
    15000,
  );
  await streetIn.clear();
  await streetIn.sendKeys(streetPh);
}
