/** Password rules must match backend {@code PasswordPolicy}. */
export type PasswordRuleCheck = { id: string; ok: boolean; label: string };

export function passwordRuleChecks(password: string, username: string): PasswordRuleCheck[] {
  const u = (username ?? "").trim().toLowerCase();
  const p = password ?? "";
  return [
    { id: "len", ok: p.length >= 10 && p.length <= 100, label: "10–100 ký tự" },
    { id: "lower", ok: /[a-z]/.test(p), label: "Ít nhất một chữ thường" },
    { id: "upper", ok: /[A-Z]/.test(p), label: "Ít nhất một chữ hoa" },
    { id: "digit", ok: /[0-9]/.test(p), label: "Ít nhất một chữ số" },
    { id: "special", ok: /[^A-Za-z0-9]/.test(p), label: "Ít nhất một ký tự đặc biệt" },
    {
      id: "nouser",
      ok: u.length === 0 || !p.toLowerCase().includes(u),
      label: "Không chứa tên đăng nhập",
    },
  ];
}

export function isPasswordValid(password: string, username: string): boolean {
  return passwordRuleChecks(password, username).every((c) => c.ok);
}
