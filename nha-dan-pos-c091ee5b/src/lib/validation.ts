// Shared validators for admin forms (Vietnamese messages)

// Vietnam mobile/landline: 9–11 digits, may start with +84 or 0
// Common mobile prefixes: 03,05,07,08,09 ; landlines also accepted (02x...)
const VN_PHONE_RE = /^(?:\+?84|0)(?:\d){8,10}$/;

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, "");
}

export function validatePhone(raw: string): string | null {
  const v = normalizePhone(raw || "");
  if (!v) return "Vui lòng nhập số điện thoại";
  if (!/^[\d+]+$/.test(v)) return "SĐT chỉ chứa chữ số";
  if (!VN_PHONE_RE.test(v)) return "Số điện thoại không hợp lệ (VD: 0901234567)";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(raw: string, required = false): string | null {
  const v = (raw || "").trim();
  if (!v) return required ? "Vui lòng nhập email" : null;
  if (!EMAIL_RE.test(v)) return "Email không hợp lệ";
  if (v.length > 255) return "Email quá dài";
  return null;
}

export function validateRequired(raw: string, label: string): string | null {
  if (!raw || !raw.trim()) return `Vui lòng nhập ${label.toLowerCase()}`;
  return null;
}
