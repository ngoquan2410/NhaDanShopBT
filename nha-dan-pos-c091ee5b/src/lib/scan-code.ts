/**
 * Normalize a scanned/typed code: trim + strip control chars.
 * HID scanners may append \r\n or stray whitespace.
 */
export function normalizeScanCode(raw: string): string {
  return (raw || "").replace(/[\r\n\t]/g, "").trim();
}
