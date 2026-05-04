import { readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(process.cwd(), "src");

/** Files that define local/mock sources; scanning them would trivially match guard patterns. */
const SKIP_VIOLATION_SCAN = new Set<string>([
  "lib/mock-data.ts",
  "lib/store.ts",
  "lib/vouchers-store.ts",
  "lib/pos-scan-demo.ts",
  "services/adapters/local/LocalGoodsReceiptAdapter.ts",
  "services/adapters/local/LocalInvoiceAdapter.ts",
  "services/adapters/local/LocalVoucherAdapter.ts",
  "services/adapters/local/LocalCategoryAdapter.ts",
  "services/adapters/local/LocalProductAdapter.ts",
]);

const ENTRY_POINTS = [
  join(SRC_ROOT, "App.tsx"),
  join(SRC_ROOT, "components", "layout", "AdminLayout.tsx"),
  join(SRC_ROOT, "components", "layout", "StorefrontLayout.tsx"),
  join(SRC_ROOT, "components", "layout", "AdminAuthGuard.tsx"),
  join(SRC_ROOT, "lib", "admin-auth.tsx"),
  join(SRC_ROOT, "services", "index.ts"),
];

function resolveImport(_fromFile: string, spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const sub = spec.slice(2);
  const base = join(SRC_ROOT, sub);
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function extractSpecs(text: string): string[] {
  const specs: string[] = [];
  const re = /from\s+["'](@\/[^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    specs.push(m[1]);
  }
  return specs;
}

function collectReachableSourceFiles(): string[] {
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const p of ENTRY_POINTS) {
    if (existsSync(p)) queue.push(p);
  }
  while (queue.length) {
    const f = queue.pop()!;
    if (visited.has(f)) continue;
    visited.add(f);
    const rel = relative(SRC_ROOT, f).replace(/\\/g, "/");
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    let text: string;
    try {
      if (!statSync(f).isFile()) continue;
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const spec of extractSpecs(text)) {
      const resolved = resolveImport(f, spec);
      if (!resolved) continue;
      const rrel = relative(SRC_ROOT, resolved).replace(/\\/g, "/");
      if (rrel.startsWith("..")) continue;
      if (rrel.includes("node_modules")) continue;
      queue.push(resolved);
    }
  }
  return [...visited].sort();
}

function lineLooksComment(trimmed: string): boolean {
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function stripTypeOnlyMockImports(text: string): string {
  return text.replace(/import\s+type[\s\S]*?from\s+["']@\/lib\/mock-data["']\s*;?/g, "");
}

function localAdapterViolations(rel: string, text: string): string[] {
  const v: string[] = [];
  if (rel !== "services/index.ts") return v;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || lineLooksComment(t)) continue;
    if (/\bnew\s+Local\w*Adapter\s*\(/.test(line)) {
      if (/\bLocalAddressAdapter\b/.test(line)) continue;
      if (/\bLocalInvoiceAdapter\b/.test(line) && /shouldUseLocalInvoiceAdapterForAdmin/.test(text)) continue;
      v.push(`${rel}: ${line.trim()}`);
    }
  }
  return v;
}

describe("Slice 8B production guard scan", () => {
  it(
    "reachable App → services graph avoids store runtime, value mock-data, settings keys, and POS mock scan",
    () => {
    const violations: string[] = [];
    const reachable = collectReachableSourceFiles();

    for (const f of reachable) {
      const rel = relative(SRC_ROOT, f).replace(/\\/g, "/");
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      if (rel.includes("/services/adapters/local/")) continue;
      if (SKIP_VIOLATION_SCAN.has(rel)) continue;

      const text = readFileSync(f, "utf8");

      if (/store_payment_settings:v1|shipping_config:v1/.test(text)) {
        violations.push(`${rel}: forbidden localStorage settings key`);
      }
      if (/from\s+["']@\/lib\/store["']/.test(text)) {
        violations.push(`${rel}: @/lib/store import`);
      }
      if (/\binvoiceActions\b/.test(text) && !/invoiceAdapterResolution/.test(rel)) {
        const stripped = text.replace(/\/\/[^\n]*/g, "");
        if (/from\s+["']@\/lib\/store["']/.test(stripped) && /\binvoiceActions\b/.test(stripped)) {
          violations.push(`${rel}: invoiceActions with @/lib/store`);
        }
      }
      if (/current-customer|vouchers-store/.test(text) && /from\s+["']@\/lib\//.test(text)) {
        const t = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        if (t.includes("current-customer") || t.includes("vouchers-store")) {
          violations.push(`${rel}: forbidden local module path (current-customer / vouchers-store)`);
        }
      }

      let remainder = stripTypeOnlyMockImports(text);
      if (/from\s+["']@\/lib\/mock-data["']/.test(remainder)) {
        violations.push(`${rel}: non-type import from @/lib/mock-data`);
      }

      if (/\bproducts\s+as\s+allProducts\b/.test(text)) {
        violations.push(`${rel}: products as allProducts`);

      }
      if (/\bimport\s*\{[^}]*\bresolveScannedCode\b[^}]*\}\s*from/.test(text) && rel !== "lib/pos-scan-demo.ts") {
        violations.push(`${rel}: static import of resolveScannedCode`);
      }

      violations.push(...localAdapterViolations(rel, text));

      for (const line of text.split("\n")) {
        const t = line.trim();
        if (lineLooksComment(t)) continue;
        if (/\buseStore\s*\(/.test(line)) {
          violations.push(`${rel}: useStore(`);
        }
      }
    }

    const posPath = join(SRC_ROOT, "pages", "admin", "POS.tsx");
    if (existsSync(posPath)) {
      const posText = readFileSync(posPath, "utf8");
      if (/pos-scan-demo|resolveScannedCode/.test(posText)) {
        violations.push("POS.tsx: production POS must not load mock scan demo or resolveScannedCode");
      }
    }

    expect(violations, `\n${violations.join("\n")}`).toEqual([]);
    },
    120_000,
  );
});
