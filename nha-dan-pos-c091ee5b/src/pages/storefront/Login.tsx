import { StatusBadge } from "@/components/shared/StatusBadge";
import { User, KeyRound, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/admin-auth";
import { resolvePostLoginPath } from "@/lib/postLoginDestination";
import { toast } from "sonner";

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const r = searchParams.get("reason");
    if (r === "totp-enabled") {
      toast.message("Đã bật TOTP. Đăng nhập lại — bước tiếp theo sẽ yêu cầu mã 6 số từ ứng dụng xác thực.");
    }
  }, [searchParams]);

  const routeAfterLogin = () => {
    const next = searchParams.get("next");
    let roles = auth.session?.roles ?? [];
    try {
      roles = JSON.parse(window.localStorage.getItem("nhadan.auth.session.v1") || "{}")?.roles ?? roles;
    } catch { /* ignore */ }
    navigate(resolvePostLoginPath(next, roles), { replace: true });
  };

  const doLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await auth.signIn(username.trim(), password);
      if (res.error) return toast.error(res.error);
      if (res.totpRequired && res.preAuthToken) {
        setPreAuthToken(res.preAuthToken);
        setShowOtp(true);
        return;
      }
      toast.success("Đăng nhập thành công");
      setTimeout(routeAfterLogin, 0);
    } finally { setLoading(false); }
  };

  const doVerify = async () => {
    if (!preAuthToken) return;
    setLoading(true);
    try {
      const res = await auth.verifyTotp(preAuthToken, otp);
      if (res.error) return toast.error(res.error);
      toast.success("Đăng nhập thành công");
      setTimeout(routeAfterLogin, 0);
    } finally { setLoading(false); }
  };

  if (showOtp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4">
        <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6">
          <div className="text-center mb-6">
            <div className="h-12 w-12 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold">Xác thực OTP</h1>
            <p className="text-sm text-muted-foreground mt-1">Nhập mã 6 chữ số từ ứng dụng xác thực</p>
          </div>
          <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="mb-4 w-full h-12 text-center text-lg font-bold border-2 rounded-lg bg-background focus:outline-none focus:border-primary transition-colors" placeholder="123456" />
          <button disabled={loading || otp.length < 6} onClick={doVerify} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50">
            Xác nhận
          </button>
          <button onClick={() => setShowOtp(false)} className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground">
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4">
      <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6">
        <div className="text-center mb-6">
          <div className="h-12 w-12 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold">Đăng nhập</h1>
          <p className="text-sm text-muted-foreground mt-1">Chào mừng bạn quay lại NhaDanShop</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doLogin();
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tên đăng nhập</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" autoComplete="username" className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mật khẩu</label>
            <div className="relative mt-1">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} placeholder="Nhập mật khẩu" autoComplete="current-password" className="w-full h-10 px-3 pr-10 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Quên mật khẩu?</Link>
          </div>
          <button type="submit" disabled={loading || !username.trim() || !password} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50">
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Chưa có tài khoản? <Link to="/signup" className="text-primary font-medium hover:underline">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}
