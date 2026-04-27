import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Shield, Smartphone, LogOut, Check, Lock, QrCode, Monitor, Smartphone as Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Session {
  id: string;
  device: string;
  browser: string;
  location: string;
  current: boolean;
  lastActive: string;
  type: 'desktop' | 'mobile';
}

const initialSessions: Session[] = [
  { id: 's1', device: 'Windows 11', browser: 'Chrome 124', location: 'TP.HCM', current: true, lastActive: 'Đang dùng', type: 'desktop' },
  { id: 's2', device: 'iPhone 15', browser: 'Safari', location: 'TP.HCM', current: false, lastActive: '2 giờ trước', type: 'mobile' },
  { id: 's3', device: 'macOS', browser: 'Chrome 124', location: 'Hà Nội', current: false, lastActive: 'Hôm qua', type: 'desktop' },
];

export default function AdminSecurity() {
  const [totpEnabled, setTotpEnabled] = useState(true);
  const [showDisableTotp, setShowDisableTotp] = useState(false);
  const [showLogoutAll, setShowLogoutAll] = useState(false);
  const [showEnableTotp, setShowEnableTotp] = useState(false);
  const [logoutSession, setLogoutSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);

  const handleLogoutSession = (s: Session) => {
    setSessions(prev => prev.filter(x => x.id !== s.id));
    toast.success(`Đã đăng xuất thiết bị ${s.device}`);
  };

  const handleLogoutAll = () => {
    setSessions(prev => prev.filter(s => s.current));
    toast.success("Đã đăng xuất tất cả thiết bị khác");
  };

  return (
    <div className="space-y-4 admin-dense max-w-2xl">
      <PageHeader title="Bảo mật" description="Quản lý bảo mật tài khoản" />

      {/* Security posture */}
      <div className={cn("rounded-lg border p-4", totpEnabled ? "bg-success-soft border-success/20" : "bg-warning-soft border-warning/20")}>
        <div className="flex items-center gap-3">
          <div className={cn("rounded-full p-2", totpEnabled ? "bg-success/10" : "bg-warning/10")}>
            <Shield className={cn("h-5 w-5", totpEnabled ? "text-success" : "text-warning")} />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{totpEnabled ? 'Bảo mật tốt' : 'Cần cải thiện bảo mật'}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totpEnabled ? 'Xác thực 2 bước đã được bật. Tài khoản được bảo vệ.' : 'Bạn chưa bật xác thực 2 bước. Nên bật để bảo vệ tài khoản.'}
            </p>
          </div>
        </div>
      </div>

      {/* TOTP */}
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary-soft p-2 shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Xác thực 2 bước (TOTP)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Sử dụng ứng dụng xác thực (Google Authenticator, Authy) để tạo mã OTP khi đăng nhập.</p>
              <div className="mt-2"><StatusBadge status={totpEnabled ? 'totp-enabled' : 'totp-disabled'} size="md" /></div>
            </div>
          </div>
          {totpEnabled ? (
            <button onClick={() => setShowDisableTotp(true)} className="px-3 py-1.5 text-xs font-medium border border-danger text-danger rounded-md hover:bg-danger-soft shrink-0">Tắt TOTP</button>
          ) : (
            <button onClick={() => setShowEnableTotp(true)} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover shrink-0">Bật TOTP</button>
          )}
        </div>
      </div>

      {showEnableTotp && (
        <div className="bg-card rounded-lg border p-4 animate-fade-in">
          <h3 className="font-semibold text-sm mb-3">Thiết lập TOTP</h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center justify-center w-40 h-40 bg-muted rounded-lg border shrink-0">
              <QrCode className="h-12 w-12 text-muted-foreground/40" />
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-xs text-muted-foreground">1. Quét mã QR bằng ứng dụng xác thực</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Hoặc nhập mã thủ công:</label>
                <code className="mt-1 block px-2 py-1.5 text-xs bg-muted rounded font-mono select-all">JBSWY3DPEHPK3PXP</code>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">2. Nhập mã OTP 6 số:</label>
                <input placeholder="000000" maxLength={6} className="mt-1 w-40 h-8 px-3 text-sm font-mono tracking-widest border rounded-md bg-background text-center focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setTotpEnabled(true); setShowEnableTotp(false); toast.success("Đã bật xác thực 2 bước"); }} className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md"><Check className="h-3 w-3 inline mr-1" /> Xác nhận</button>
                <button onClick={() => setShowEnableTotp(false)} className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sessions */}
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2 shrink-0">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Phiên đăng nhập</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{sessions.length} phiên đang hoạt động</p>
            <div className="mt-3 space-y-2">
              {sessions.map(s => {
                const Icon = s.type === 'mobile' ? Phone : Monitor;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-md border">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{s.device} · {s.browser}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.location} · {s.lastActive}</p>
                      </div>
                    </div>
                    {s.current ? (
                      <StatusBadge status="active" label="Hiện tại" />
                    ) : (
                      <button onClick={() => setLogoutSession(s)} className="px-2 py-1 text-[11px] font-medium border border-danger text-danger rounded hover:bg-danger-soft shrink-0">
                        Đăng xuất
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowLogoutAll(true)} disabled={sessions.filter(s => !s.current).length === 0} className="px-3 py-1.5 text-xs font-medium border border-danger text-danger rounded-md hover:bg-danger-soft disabled:opacity-50 disabled:cursor-not-allowed">
                <LogOut className="h-3 w-3 inline mr-1" /> Đăng xuất tất cả thiết bị khác
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog open={showDisableTotp} onClose={() => setShowDisableTotp(false)} onConfirm={() => { setTotpEnabled(false); toast.success("Đã tắt TOTP"); }} title="Tắt xác thực 2 bước?" description="Tài khoản sẽ kém an toàn hơn nếu tắt TOTP. Bạn có chắc chắn?" confirmLabel="Tắt TOTP" variant="danger" />
      <ConfirmDialog open={showLogoutAll} onClose={() => setShowLogoutAll(false)} onConfirm={handleLogoutAll} title="Đăng xuất tất cả thiết bị khác?" description="Tất cả phiên trừ phiên hiện tại sẽ bị kết thúc. Người dùng sẽ phải đăng nhập lại trên các thiết bị đó." confirmLabel="Đăng xuất tất cả" variant="warning" />
      <ConfirmDialog open={!!logoutSession} onClose={() => setLogoutSession(null)} onConfirm={() => logoutSession && handleLogoutSession(logoutSession)} title="Đăng xuất thiết bị này?" description={`Phiên trên ${logoutSession?.device} (${logoutSession?.browser}) sẽ bị kết thúc.`} confirmLabel="Đăng xuất" variant="warning" />
    </div>
  );
}
