/** Same token sets as backend {@code ImportSellableParser}. */

const TRUE_TOKENS = new Set([
  "true",
  "1",
  "yes",
  "y",
  "co",
  "có",
  "ban",
  "bán",
  "sellable",
]);

const FALSE_TOKENS = new Set([
  "false",
  "0",
  "no",
  "n",
  "khong",
  "không",
  "nguyen_lieu",
  "nguyên liệu",
  "raw",
  "inventory",
]);

export type SellableParseResult = {
  value: boolean | null;
  explicit: boolean;
  invalid: boolean;
};

export function parseImportSellableCell(raw: string | undefined | null): SellableParseResult {
  if (raw == null || String(raw).trim() === "") {
    return { value: null, explicit: false, invalid: false };
  }
  const key = String(raw).trim().toLowerCase();
  if (TRUE_TOKENS.has(key)) {
    return { value: true, explicit: true, invalid: false };
  }
  if (FALSE_TOKENS.has(key)) {
    return { value: false, explicit: true, invalid: false };
  }
  return { value: null, explicit: true, invalid: true };
}

export function defaultSellableTrue(parsed: boolean | null | undefined): boolean {
  return parsed == null || parsed;
}
