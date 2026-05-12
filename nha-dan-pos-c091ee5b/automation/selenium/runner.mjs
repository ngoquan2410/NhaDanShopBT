import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadAutomationConfig } from "./config.mjs";
import { createDriver } from "./helpers/driver.mjs";
import { resetBrowserSession } from "./helpers/session.mjs";
import { saveFailureArtifacts } from "./helpers/artifacts.mjs";
import { createApiHelper } from "./helpers/api.mjs";
import * as authHelpers from "./helpers/auth.mjs";
import * as assertionHelpers from "./helpers/assertions.mjs";

async function warmupActuator(apiBaseUrl) {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/actuator/health`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) console.warn(`Warmup ${url} → HTTP ${res.status}`);
    else console.log(`Warmup OK ${url}`);
  } catch (e) {
    console.warn(`Warmup failed (${url}): ${e?.message || e}`);
  } finally {
    clearTimeout(t);
  }
}

function matchesTags(specTags, scopeTags, explicitTags) {
  if (explicitTags.length > 0) {
    return explicitTags.some((t) => specTags.includes(t));
  }
  if (scopeTags.length === 0) return true;
  return scopeTags.some((t) => specTags.includes(t));
}

async function discoverSpecs(specsDir) {
  const names = fs
    .readdirSync(specsDir)
    .filter((f) => f.endsWith(".spec.mjs"))
    .sort();
  const loaded = [];
  for (const file of names) {
    const abs = path.join(specsDir, file);
    const mod = await import(pathToFileURL(abs).href);
    const spec = mod.default;
    if (!spec || typeof spec.run !== "function") {
      console.warn(`Ignoring invalid spec module: ${file}`);
      continue;
    }
    loaded.push({
      id: path.basename(file, ".spec.mjs"),
      file,
      name: spec.name || file,
      tags: Array.isArray(spec.tags) ? spec.tags : [],
      order: typeof spec.order === "number" ? spec.order : 100,
      skip: Boolean(spec.skip),
      run: spec.run,
    });
  }
  loaded.sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
  return loaded;
}

/**
 * @param {ReturnType<typeof loadAutomationConfig>} config
 */
export async function runAutomationSuite(config) {
  fs.mkdirSync(config.artifactDir, { recursive: true });

  if (config.warmup) {
    await warmupActuator(config.apiBaseUrl);
  }

  const specs = await discoverSpecs(config.specsGlobDir);
  const filtered = specs.filter((s) => matchesTags(s.tags, config.scopeTags, config.explicitTags));

  if (filtered.length === 0) {
    console.warn("No specs matched tag filter.");
    const emptySummary = {
      generatedAt: new Date().toISOString(),
      baseUrl: config.baseUrl,
      apiBaseUrl: config.apiBaseUrl,
      automationScope: config.scope,
      tagsFilter: config.explicitTags,
      passed: 0,
      failed: 0,
      skipped: 0,
      specs: [],
    };
    try {
      fs.writeFileSync(
        path.join(config.artifactDir, "automation-summary.json"),
        `${JSON.stringify(emptySummary, null, 2)}\n`,
        "utf8",
      );
    } catch {
      /* ignore */
    }
    return { passed: 0, failed: 0, skipped: 0 };
  }

  const driver = await createDriver({ headed: config.headed });

  const strictNoSkip =
    process.env.AUTOMATION_NO_SKIP === "1" ||
    config.scope === "full" ||
    config.scope === "regression";

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  /** @type {{ specId: string, name: string, tags: string[], outcome: 'pass'|'fail'|'skipped', reason?: string }[]} */
  const specResults = [];

  try {
    for (const spec of filtered) {
      const slug = spec.id;
      const api = createApiHelper(config.apiBaseUrl);
      const ctx = {
        config,
        api,
        /** Deterministic teardown hooks (LIFO); pair with API seed helpers. */
        seed: {
          registerCleanup: (fn) => api.registerCleanup(fn),
        },
        auth: authHelpers,
        assert: assertionHelpers,
        artifacts: {
          saveFailure: async () =>
            saveFailureArtifacts(driver, { artifactDir: config.artifactDir, slug }),
        },
      };

      console.log(`\n→ ${spec.name} [${spec.tags.join(", ")}]`);

      if (spec.skip) {
        if (strictNoSkip) {
          console.error(`  ✗ spec disabled in module — not allowed for scope ${config.scope}`);
          failed++;
          specResults.push({
            specId: slug,
            name: spec.name,
            tags: spec.tags,
            outcome: "fail",
            reason: "disabled in spec (full/regression requires all specs enabled)",
          });
        } else {
          console.log(`  ⊗ skipped (disabled in spec)`);
          skipped++;
          specResults.push({ specId: slug, name: spec.name, tags: spec.tags, outcome: "skipped", reason: "disabled in spec" });
        }
        continue;
      }

      await resetBrowserSession(driver, config.baseUrl);

      /** @type {'pass'|'fail'|'skipped'} */
      let outcome = "pass";
      let skipReason;
      let ret = null;

      try {
        ret = await spec.run(driver, ctx);
        await api.runCleanups();

        if (ret && typeof ret === "object" && ret.skipped) {
          if (strictNoSkip) {
            throw new Error(`AUTOMATION_NO_SKIP: spec must not skip — ${ret.reason || "unspecified"}`);
          }
          outcome = "skipped";
          skipReason = ret.reason || "unspecified";
          console.log(`  ⊗ skipped — ${skipReason}`);
        } else if (ret && typeof ret === "object" && ret.outcome === "fail") {
          outcome = "fail";
          skipReason = ret.reason || "spec reported outcome fail";
          const meta = await saveFailureArtifacts(driver, {
            artifactDir: config.artifactDir,
            slug,
          }).catch(() => ({ url: "", base: "" }));
          console.error(`  ✗ ${skipReason}`);
          if (meta.url) console.error(`    URL: ${meta.url}`);
          if (meta.base) console.error(`    Artifacts: ${meta.base}.*`);
        }
      } catch (e) {
        await api.runCleanups().catch(() => {});

        if (e?.code === "TOTP_REQUIRED") {
          skipReason = "TOTP_REQUIRED (use seed user admin / admin123, not admin_totp)";
          if (strictNoSkip) {
            outcome = "fail";
            const meta = await saveFailureArtifacts(driver, {
              artifactDir: config.artifactDir,
              slug,
            }).catch(() => ({ url: "", base: "" }));
            console.error(`  ✗ ${skipReason} (artifacts: ${meta.base || "n/a"})`);
          } else {
            outcome = "skipped";
            const meta = await saveFailureArtifacts(driver, {
              artifactDir: config.artifactDir,
              slug,
            }).catch(() => ({ url: "", base: "" }));
            console.error(`  ⊗ skipped — admin login requires TOTP (artifacts: ${meta.base || "n/a"})`);
          }
        } else {
          outcome = "fail";
          skipReason = e?.message || String(e);
          const meta = await saveFailureArtifacts(driver, {
            artifactDir: config.artifactDir,
            slug,
          }).catch(() => ({ url: "", base: "" }));

          console.error(`  ✗ ${skipReason}`);
          if (meta.url) console.error(`    URL: ${meta.url}`);
          if (meta.base) console.error(`    Artifacts: ${meta.base}.*`);
        }
      }

      specResults.push({
        specId: slug,
        name: spec.name,
        tags: spec.tags,
        outcome,
        ...(ret && typeof ret === "object" && Array.isArray(ret.caseResults)
          ? { caseResults: ret.caseResults }
          : {}),
        ...(skipReason ? { reason: skipReason } : {}),
      });

      /** B2.1: always persist full case matrix to a sidecar file when the spec returns caseResults. */
      try {
        if (ret && typeof ret === "object" && Array.isArray(ret.caseResults)) {
          if (slug === "slice-b2-b21-product-parent") {
            const sidecar = path.join(config.artifactDir, "slice-b2-b21-case-results.json");
            fs.writeFileSync(
              sidecar,
              `${JSON.stringify({ generatedAt: new Date().toISOString(), outcome, reason: skipReason, caseResults: ret.caseResults }, null, 2)}\n`,
              "utf8",
            );
            console.log(`  B2.1 case matrix: ${sidecar}`);
          }
          if (slug === "slice-b2-b22-variant-transaction-search") {
            const sidecar = path.join(config.artifactDir, "slice-b2-b22-case-results.json");
            fs.writeFileSync(
              sidecar,
              `${JSON.stringify({ generatedAt: new Date().toISOString(), outcome, reason: skipReason, caseResults: ret.caseResults }, null, 2)}\n`,
              "utf8",
            );
            console.log(`  B2.2 case matrix: ${sidecar}`);
          }
          if (slug === "slice-b2-b23-entity-list-search") {
            const sidecar = path.join(config.artifactDir, "slice-b2-b23-case-results.json");
            fs.writeFileSync(
              sidecar,
              `${JSON.stringify({ generatedAt: new Date().toISOString(), outcome, reason: skipReason, caseResults: ret.caseResults }, null, 2)}\n`,
              "utf8",
            );
            console.log(`  B2.3 case matrix: ${sidecar}`);
          }
          if (slug === "hotfix-storefront-payment" && Array.isArray(ret.caseResults)) {
            const sidecar = path.join(config.artifactDir, "hotfix-storefront-payment-case-results.json");
            fs.writeFileSync(
              sidecar,
              `${JSON.stringify({ generatedAt: new Date().toISOString(), outcome, reason: skipReason, caseResults: ret.caseResults }, null, 2)}\n`,
              "utf8",
            );
            console.log(`  Hotfix case matrix: ${sidecar}`);
          }
        }
      } catch (w) {
        console.warn("  Could not write B2 case-results sidecar:", w?.message || w);
      }

      if (outcome === "pass") {
        passed++;
        console.log(`  ✓ pass`);
      } else if (outcome === "skipped") {
        skipped++;
      } else {
        failed++;
      }
    }
  } finally {
    await driver.quit().catch(() => {});
  }

  const summaryPayload = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
    automationScope: config.scope,
    tagsFilter: config.explicitTags,
    passed,
    failed,
    skipped,
    specs: specResults,
  };

  try {
    const summaryPath = path.join(config.artifactDir, "automation-summary.json");
    fs.writeFileSync(summaryPath, `${JSON.stringify(summaryPayload, null, 2)}\n`, "utf8");
    console.log(`Summary JSON: ${summaryPath}`);
  } catch (e) {
    console.warn("Could not write automation-summary.json:", e?.message || e);
  }

  console.log("\n──────── Automation summary ────────");
  console.log(`  Passed : ${passed}`);
  console.log(`  Failed : ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Artifacts directory: ${config.artifactDir}`);
  console.log("─────────────────────────────────────\n");

  return { passed, failed, skipped };
}
