export function uid(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** DH-YYYYMMDD-XXXX human-readable order code. */
export function generateOrderCode(prefix = "DH"): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${y}${m}${day}-${seq}`;
}

export function pointsHistoryId(): string {
  return uid("ph_");
}
