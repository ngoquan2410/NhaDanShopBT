import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/admin-auth";
import { toast } from "sonner";
import { isPasswordValid, passwordRuleChecks } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const checks = passwordRuleChecks(password, username);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast.error("Vui lòng nhập tên đăng nhập");
      return;
    }
    if (!isPasswordValid(password, username)) {
      toast.error("Mật khẩu chưa đủ mạnh");
      return;
    }
    if (password !== confirm) {
      toast.error("Xác nhận mật khẩu không khớp");
      return;
    }
    setLoading(true);
    try {
      const res = await auth.signUp(username.trim(), password, fullName.trim() || undefined, phone.trim() || undefined);
      if (res.error) {
        if (res.code === "PHONE_ALREADY_REGISTERED") {
          return toast.error("Số điện thoại này đã được đăng ký tài khoản. Vui lòng đăng nhập hoặc dùng số khác.");
        }
        if (res.code === "USERNAME_ALREADY_EXISTS") {
          return toast.error("Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.");
        }
        return toast.error(res.error);
      }
      toast.success("Đăng ký thành công");
      navigate("/account", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4 py-10">
      <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6">
        <div className="text-center mb-6">
          <div className="h-12 w-12 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground mt-1">Đăng ký tài khoản NhaDanShop</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tên đăng nhập *</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Họ tên</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nhập họ tên (tùy chọn)"
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Số điện thoại</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Nhập SĐT đã mua hàng tại cửa hàng"
              autoComplete="tel"
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mật khẩu *</label>
            <div className="relative mt-1">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPw ? "text" : "password"}
                placeholder="Tối thiểu 10 ký tự, đủ loại ký tự"
                autoComplete="new-password"
                className="w-full h-10 px-3 pr-10 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {checks.map((c) => (
                <li key={c.id} className={cn("text-[11px]", c.ok ? "text-success" : "text-muted-foreground")}>
                  {c.ok ? "✓ " : "○ "}
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Xác nhận mật khẩu *</label>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Đang tạo..." : "Tạo tài khoản"}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Đã có tài khoản? <Link to="/login" className="text-primary font-medium hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
