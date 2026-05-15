import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const argvRoots = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const roots = argvRoots.length > 0 ? argvRoots : ["src"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".java", ".properties", ".yaml", ".yml"]);
const badPatterns = [
  /\u00c3[\u0080-\u00bf]/,
  /\u00e1[\u00ba\u00bb]/,
  /\u00c4[\u0080-\u00bf\u2018-\u201f]/,
  /\u00c6[\u0080-\u00bf]/,
  /\u00e2[\u0080-\u20ff]/
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!["node_modules", "dist", "build", "coverage", ".git"].includes(name)) walk(path, out);
      continue;
    }
    const ext = path.slice(path.lastIndexOf("."));
    if (extensions.has(ext)) out.push(path);
  }
  return out;
}

const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (badPatterns.some((pattern) => pattern.test(line))) {
        hits.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

if (hits.length) {
  console.error("Possible UTF-8 mojibake detected:");
  console.error(hits.slice(0, 80).join("\n"));
  if (hits.length > 80) console.error(`...and ${hits.length - 80} more`);
  process.exit(1);
}
