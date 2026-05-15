import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isPasswordValid, passwordRuleChecks } from "@/lib/passwordPolicy";
import { useAuth } from "@/lib/admin-auth";
import { mapPasswordError, passwordApi } from "@/services/auth/passwordApi";

type Props = {
  layout?: "comfortable" | "compact";
};

export function ChangePasswordPanel({ layout = "comfortable" }: Props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const username = auth.session?.username ?? "";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pending, setPending] = useState(false);

  const checks = passwordRuleChecks(newPassword, username);
  const canSubmit =
    currentPassword.length > 0 &&
    isPasswordValid(newPassword, username) &&
    newPassword === confirmPassword &&
    !pending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    try {
      await passwordApi.changePassword({ currentPassword, newPassword, confirmPassword });
      toast.success("Đã đổi mật khẩu, vui lòng đăng nhập lại.");
      await auth.signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(mapPasswordError(err));
    } finally {
      setPending(false);
    }
  };

  const dense = layout === "compact";

  return (
    <div className={cn("bg-card rounded-lg border min-w-0", dense ? "p-4" : "p-5")} data-testid="change-password-panel">
      <div className="flex items-start gap-2 min-w-0">
        <KeyRound className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className={cn("font-semibold", dense ? "text-sm" : "text-base")}>Đổi mật khẩu</h2>
          {!dense && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Sau khi đổi, bạn sẽ đăng xuất và đăng nhập lại bằng mật khẩu mới.
            </p>
          )}
        </div>
      </div>
      <form onSubmit={submit} className={cn("space-y-3 min-w-0", dense ? "mt-3" : "mt-4")}>
        <PasswordField
          label="Mật khẩu hiện tại"
          value={currentPassword}
          onChange={setCurrentPassword}
          show={showCurrent}
          onToggleShow={() => setShowCurrent((v) => !v)}
          autoComplete="current-password"
          testId="change-password-current"
        />
        <PasswordField
          label="Mật khẩu mới"
          value={newPassword}
          onChange={setNewPassword}
          show={showNew}
          onToggleShow={() => setShowNew((v) => !v)}
          autoComplete="new-password"
          testId="change-password-new"
        />
        <ul className="space-y-0.5 leading-tight">
          {checks.map((c) => (
            <li key={c.id} className={cn("text-[11px] leading-tight break-words", c.ok ? "text-success" : "text-muted-foreground")}>
              {c.ok ? "✓ " : "○ "}
              {c.label}
            </li>
          ))}
        </ul>
        <PasswordField
          label="Xác nhận mật khẩu mới"
          value={confirmPassword}
          onChange={setConfirmPassword}
          show={showNew}
          onToggleShow={() => setShowNew((v) => !v)}
          autoComplete="new-password"
          testId="change-password-confirm"
        />
        {confirmPassword.length > 0 && newPassword !== confirmPassword && (
          <p className="text-[11px] text-danger">Xác nhận mật khẩu không khớp</p>
        )}
        <button
          type="submit"
          data-testid="change-password-submit"
          disabled={!canSubmit}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Đang lưu..." : "Đổi mật khẩu"}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
  testId: string;
}) {
  return (
    <div className="min-w-0">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative mt-1">
        <input
          data-testid={testId}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full min-w-0 h-10 px-3 pr-10 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
