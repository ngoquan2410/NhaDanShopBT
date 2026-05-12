/**
 * Local-date helpers — UI ONLY.
 *
 * Do NOT use these to replace backend timestamps. They exist so that "today"
 * pickers and date inputs reflect the user's local calendar day instead of UTC.
 *
 * Pitfall replaced: `new Date().toISOString().slice(0, 10)` returns the UTC
 * date, so users in UTC+7 see the previous day after 17:00 local time.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local YYYY-MM-DD for a given Date (defaults to now). */
export function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local YYYY-MM-DDTHH:mm for a given Date (defaults to now). */
export function toLocalDateTimeString(d: Date = new Date()): string {
  return `${toLocalDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local today's date as YYYY-MM-DD. */
export function localToday(): string {
  return toLocalDateString(new Date());
}

/** Alias for HTML date input formatting (same as {@link toLocalDateString}). */
export const formatLocalDateInput = toLocalDateString;

/** Alias for {@link localToday} — explicit name for date input defaults. */
export const todayLocalDateInput = localToday;

/**
 * Parse `yyyy-MM-dd` as a local calendar date (year/month/day in local time).
 * Avoids `Date.parse` / ISO-only strings, which are treated as UTC midnight.
 */
export function parseLocalDateInput(value: string): Date {
  const s = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d);
}

/** True if `value` is a valid `yyyy-MM-dd` that round-trips through local formatting. */
export function isValidDateInput(value: string): boolean {
  const d = parseLocalDateInput(value);
  if (Number.isNaN(d.getTime())) return false;
  return toLocalDateString(d) === value.trim();
}

/** Add calendar days to a `yyyy-MM-dd` string in local civil time. */
export function addLocalCalendarDays(yyyyMmDd: string, deltaDays: number): string {
  const d = parseLocalDateInput(yyyyMmDd);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateString(d);
}
