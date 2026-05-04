import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

describe("Selenium automation harness wiring", () => {
  it("npm run test:automation delegates to automation/selenium/run-selenium.mjs with RUN_* gate", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["test:automation"]).toMatch(/automation\/selenium\/run-selenium\.mjs/);
    const gate = readFileSync(resolve(ROOT, "automation", "selenium", "run-selenium.mjs"), "utf8");
    expect(gate).toMatch(/RUN_AUTOMATION|RUN_FE_BE_E2E/);
    expect(gate).toContain("actuator/health");
  });
});
