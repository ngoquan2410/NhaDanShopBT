/**
 * Match imported Excel category names to catalog categories (trim, lowercase,
 * collapse inner whitespace, NFC normalize).
 */
export function normalizeCategoryNameForMatch(raw: string): string {
  return raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/** First category whose normalized name equals imported text (if any). */
export function findCategoryByImportedName<T extends { name: string }>(
  categories: readonly T[],
  imported: string,
): T | null {
  const key = normalizeCategoryNameForMatch(imported);
  if (!key) return null;
  return categories.find((c) => normalizeCategoryNameForMatch(c.name) === key) ?? null;
}

/** True when Excel provides a non-empty category string that does not match any existing category. */
export function isImportedCategoryNew(categories: readonly { name: string }[], imported: string): boolean {
  const t = imported.trim();
  return t.length > 0 && findCategoryByImportedName(categories, imported) == null;
}
