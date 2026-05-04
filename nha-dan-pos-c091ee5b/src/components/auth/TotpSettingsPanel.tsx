import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, QrCode, Shield, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/admin-auth";
import { totpApi } from "@/services/auth/totpApi";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

type Props = {
  /** tighter spacing for account page vs admin */
  layout?: "comfortable" | "compact";
};

/**
 * Real TOTP setup / enable / disable backed by POST /api/auth/totp/*.
 * After enable, backend revokes all refresh tokens — user must sign in again (with OTP step).
 */
export function TotpSettingsPanel({ layout = "comfortable" }: Props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const totpEnabled = Boolean(auth.session?.totpEnabled);

  const [busy, setBusy] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [enableOtp, setEnableOtp] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [disableOtp, setDisableOtp] = useState("");

  const startSetup = useCallback(async () => {
    setBusy(true);
    try {
      const dto = await totpApi.setup();
      setQrDataUri(dto.qrCodeImage ?? null);
      setSecret(dto.secret ?? null);
      setEnableOtp("");
      setShowWizard(true);
      toast.message("Đã tạo mã thiết lập — quét QR rồi nhập OTP để bật.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không thiết lập được TOTP");
    } finally {
      setBusy(false);
    }
  }, []);

  const confirmEnable = useCallback(async () => {
    const otp = enableOtp.replace(/\D/g, "").trim();
    if (otp.length !== 6) {
      toast.error("Nhập đủ 6 chữ số OTP");
      return;
    }
    setBusy(true);
    try {
      await totpApi.enable(otp);
      toast.success("Đã bật TOTP. Phiên đăng nhập cũ đã hết hiệu lực — vui lòng đăng nhập lại.");
      setShowWizard(false);
      setQrDataUri(null);
      setSecret(null);
      setEnableOtp("");
      await auth.signOut();
      navigate("/login?reason=totp-enabled", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không bật được TOTP");
    } finally {
      setBusy(false);
    }
  }, [auth, enableOtp, navigate]);

  const confirmDisable = useCallback(async () => {
    const otp = disableOtp.replace(/\D/g, "").trim();
    if (otp.length !== 6) {
      toast.error("Nhập đủ 6 chữ số OTP");
      return;
    }
    setBusy(true);
    try {
      await totpApi.disable(otp);
      const next = await auth.refreshSession();
      if (!next) {
        toast.message("Đã tắt TOTP. Vui lòng đăng nhập lại.");
        await auth.signOut();
        navigate("/login", { replace: true });
        return;
      }
      toast.success("Đã tắt TOTP");
      setShowDisable(false);
      setDisableOtp("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tắt được TOTP");
    } finally {
      setBusy(false);
    }
  }, [auth, disableOtp, navigate]);

  const cardPad = layout === "compact" ? "p-4" : "p-5";

  return (
    <div className={cn("bg-card rounded-lg border", cardPad, "space-y-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-lg bg-primary-soft p-2 shrink-0">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-sm">Xác thực 2 bước (TOTP)</h2>
              <StatusBadge status={totpEnabled ? "totp-enabled" : "totp-disabled"} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Dùng Google Authenticator / Authy. Sau khi bật, mỗi lần đăng nhập sẽ yêu cầu mã 6 số.
            </p>
          </div>
        </div>
        {!totpEnabled ? (
          <button
            type="button"
            onClick={() => { void startSetup(); }}
            disabled={busy}
            className="shrink-0 h-9 px-3 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-primary disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            Bật TOTP
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowDisable(true)}
            disabled={busy}
            className="shrink-0 h-9 px-3 rounded-full border border-danger text-danger text-xs font-semibold hover:bg-danger-soft disabled:opacity-50"
          >
            Tắt TOTP
          </button>
        )}
      </div>

      {showWizard && !totpEnabled && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 animate-fade-in">
          <p className="text-xs font-medium text-muted-foreground">Hoàn tất bật TOTP</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center justify-center w-44 h-44 bg-background rounded-lg border shrink-0 overflow-hidden">
              {qrDataUri ? (
                /* eslint-disable-next-line jsx-a11y/alt-text */
                <img src={qrDataUri} className="w-full h-full object-contain" alt="" />
              ) : (
                <QrCode className="h-14 w-14 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              <p className="text-xs text-muted-foreground">Quét mã QR hoặc nhập khóa thủ công:</p>
              {secret && (
                <code className="block px-2 py-2 text-[11px] bg-background rounded border font-mono break-all select-all">{secret}</code>
              )}
              <label className="text-xs font-medium text-muted-foreground">Mã OTP 6 số</label>
              <input
                value={enableOtp}
                onChange={(e) => setEnableOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-40 h-10 px-3 text-sm font-mono tracking-widest border rounded-lg bg-background text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { void confirmEnable(); }}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-foreground text-background text-xs font-semibold disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Xác nhận bật
                </button>
                <button
                  type="button"
                  onClick={() => { setShowWizard(false); setQrDataUri(null); setSecret(null); setEnableOtp(""); }}
                  className="h-9 px-3 rounded-full border text-xs font-semibold hover:bg-muted"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDisable && totpEnabled && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft/30 p-4 space-y-2 animate-fade-in">
          <p className="text-xs font-medium">Nhập mã TOTP hiện tại để tắt</p>
          <input
            value={disableOtp}
            onChange={(e) => setDisableOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-40 h-10 px-3 text-sm font-mono tracking-widest border rounded-lg bg-background text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { void confirmDisable(); }}
              disabled={busy}
              className="h-9 px-3 rounded-full bg-danger text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Xác nhận tắt
            </button>
            <button
              type="button"
              onClick={() => { setShowDisable(false); setDisableOtp(""); }}
              className="h-9 px-3 rounded-full border text-xs font-semibold hover:bg-muted"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
