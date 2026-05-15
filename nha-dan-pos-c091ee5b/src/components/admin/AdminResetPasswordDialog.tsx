import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isPasswordValid, passwordRuleChecks } from "@/lib/passwordPolicy";
import type { UserAccount } from "@/lib/mock-data";
import { mapPasswordError, passwordApi } from "@/services/auth/passwordApi";

type Props = {
  user: UserAccount | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AdminResetPasswordDialog({ user, open, onClose, onSuccess }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);

  const targetUsername = user?.username ?? "";
  const checks = passwordRuleChecks(newPassword, targetUsername);
  const canSubmit =
    Boolean(user?.id) &&
    isPasswordValid(newPassword, targetUsername) &&
    newPassword === confirmPassword &&
    !pending;

  useEffect(() => {
    if (!open) {
      setNewPassword("");
      setConfirmPassword("");
      setShowPw(false);
      setPending(false);
    }
  }, [open, user?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !canSubmit) return;
    setPending(true);
    try {
      await passwordApi.adminResetPassword(user.id, { newPassword, confirmPassword });
      toast.success("Đã đặt lại mật khẩu và đăng xuất các phiên của người dùng.");
      onClose();
      onSuccess();
    } catch (err) {
      toast.error(mapPasswordError(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        data-testid="admin-reset-password-dialog"
        className="w-[calc(100vw-2rem)] max-w-md max-h-[min(90vh,640px)] overflow-y-auto p-4 sm:p-6 gap-3"
      >
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base">Đặt lại mật khẩu</DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            {user ? (
              <>
                @{user.username} — sẽ đăng xuất mọi phiên sau khi lưu.
              </>
            ) : (
              "Chọn người dùng."
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 min-w-0">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mật khẩu mới</label>
            <div className="relative mt-1">
              <input
                data-testid="admin-reset-password-new"
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full h-10 px-3 pr-10 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <ul className="mt-2 space-y-0.5 leading-tight">
              {checks.map((c) => (
                <li key={c.id} className={cn("text-[11px] leading-tight break-words", c.ok ? "text-success" : "text-muted-foreground")}>
                  {c.ok ? "✓ " : "○ "}
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Xác nhận mật khẩu mới</label>
            <input
              data-testid="admin-reset-password-confirm"
              type={showPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-[11px] text-danger mt-1">Xác nhận mật khẩu không khớp</p>
            )}
          </div>
          <DialogFooter className="gap-2 pt-1 flex-col-reverse sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-3 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Hủy
            </button>
            <button
              type="submit"
              data-testid="admin-reset-password-submit"
              disabled={!canSubmit}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? "Đang lưu..." : "Đặt lại mật khẩu"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
