import fs from "node:fs";
import path from "node:path";
import { logging } from "selenium-webdriver";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {{ artifactDir: string, slug: string }} opts
 */
export async function saveFailureArtifacts(driver, opts) {
  const slug = opts.slug.replace(/[^a-zA-Z0-9-_]+/g, "_");
  const dir = opts.artifactDir;
  fs.mkdirSync(dir, { recursive: true });
  const ts = stamp();
  const base = path.join(dir, `${slug}-${ts}`);

  try {
    const png = await driver.takeScreenshot();
    fs.writeFileSync(`${base}.png`, png, "base64");
  } catch {
    /* ignore */
  }

  try {
    const html = await driver.getPageSource();
    fs.writeFileSync(`${base}.html`, html, "utf8");
  } catch {
    /* ignore */
  }

  let url = "";
  try {
    url = await driver.getCurrentUrl();
    fs.writeFileSync(`${base}-url.txt`, `${url}\n`, "utf8");
  } catch {
    /* ignore */
  }

  try {
    const logs = await driver.manage().logs().get(logging.Type.BROWSER);
    const lines = logs.map((e) => `[${e.level.name}] ${e.message}`);
    fs.writeFileSync(`${base}-browser.log`, `${lines.join("\n")}\n`, "utf8");
  } catch {
    /* ignore */
  }

  return { base, url };
}
