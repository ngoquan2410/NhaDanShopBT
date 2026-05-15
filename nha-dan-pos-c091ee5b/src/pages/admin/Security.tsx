import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Shield, Lock, LogOut, Monitor, Smartphone as Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/admin-auth";
import { ChangePasswordPanel } from "@/components/auth/ChangePasswordPanel";
import { TotpSettingsPanel } from "@/components/auth/TotpSettingsPanel";

interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  current: boolean;
  lastActive: string;
  type: "desktop" | "mobile";
}

/** Placeholder until backend exposes refresh-token session listing. */
const initialSessions: Session[] = [
  { id: "s1", device: "Windows 11", browser: "Chrome", location: "—", current: true, lastActive: "Phiên hiện tại", type: "desktop" },
];

export default function AdminSecurity() {
  const auth = useAuth();
  const totpEnabled = Boolean(auth.session?.totpEnabled);

  const [showLogoutAll, setShowLogoutAll] = useState(false);
  const [logoutSession, setLogoutSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);

  const handleLogoutSession = (s: Session) => {
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    toast.success(`(Demo UI) Đã đăng xuất thiết bị ${s.device}`);
  };

  const handleLogoutAll = () => {
    setSessions((prev) => prev.filter((s) => s.current));
    toast.success("(Demo UI) Chỉ còn phiên hiện tại");
  };

  return (
    <div className="space-y-4 admin-dense max-w-2xl">
      <PageHeader title="Bảo mật" description="Quản lý bảo mật tài khoản admin" />

      <div
        className={cn(
          "rounded-lg border p-4",
          totpEnabled ? "bg-success-soft border-success/20" : "bg-warning-soft border-warning/20",
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("rounded-full p-2", totpEnabled ? "bg-success/10" : "bg-warning/10")}>
            <Shield className={cn("h-5 w-5", totpEnabled ? "text-success" : "text-warning")} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{totpEnabled ? "TOTP đang bật" : "Nên bật TOTP"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totpEnabled
                ? "Đăng nhập admin yêu cầu mã 6 số từ ứng dụng xác thực."
                : "Bật TOTP bên dưới để giảm rủi ro chiếm quyền tài khoản."}
            </p>
          </div>
        </div>
      </div>

      <ChangePasswordPanel layout="compact" />

      <TotpSettingsPanel layout="compact" />

      <div className="rounded-md border border-dashed bg-muted/20 p-3 text-[11px] text-muted-foreground break-words">
        <strong className="text-foreground">Phiên đăng nhập:</strong> Backend chưa có API liệt kê thiết bị theo refresh
        token. Khối bên dưới là <em>minh hoạ UI</em>; đăng xuất thật dùng nút trên góc hoặc{" "}
        <code className="text-xs">POST /api/auth/logout</code>.
      </div>

      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 shrink-0">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Phiên đăng nhập (minh hoạ)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{sessions.length} hàng trong bản demo</p>
            <div className="mt-3 space-y-2">
              {sessions.map((s) => {
                const Icon = s.type === "mobile" ? Phone : Monitor;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-md border">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {s.device} · {s.browser}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {s.location} · {s.lastActive}
                        </p>
                      </div>
                    </div>
                    {s.current ? (
                      <StatusBadge status="active" label="Hiện tại" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLogoutSession(s)}
                        className="px-2 py-1 text-[11px] font-medium border border-danger text-danger rounded hover:bg-danger-soft shrink-0"
                      >
                        Đăng xuất
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setShowLogoutAll(true)}
                disabled={sessions.filter((s) => !s.current).length === 0}
                className="px-3 py-1.5 text-xs font-medium border border-danger text-danger rounded-md hover:bg-danger-soft disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut className="h-3 w-3 inline mr-1" /> Đăng xuất tất cả thiết bị khác
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showLogoutAll}
        onClose={() => setShowLogoutAll(false)}
        onConfirm={handleLogoutAll}
        title="Đăng xuất tất cả thiết bị khác?"
        description="(Demo) Trên hệ thống thật, cần API revoke theo từng refresh token."
        confirmLabel="Đăng xuất tất cả"
        variant="warning"
      />
      <ConfirmDialog
        open={!!logoutSession}
        onClose={() => setLogoutSession(null)}
        onConfirm={() => logoutSession && handleLogoutSession(logoutSession)}
        title="Đăng xuất thiết bị này?"
        description={`(Demo) Phiên trên ${logoutSession?.device} (${logoutSession?.browser}).`}
        confirmLabel="Đăng xuất"
        variant="warning"
      />
    </div>
  );
}
