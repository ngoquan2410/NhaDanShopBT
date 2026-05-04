import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return toast.error("Nhập tên đăng nhập");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.detail ?? "Máy chủ chưa cấu hình gửi email (SMTP).");
        return;
      }
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.detail ?? data?.message ?? `Lỗi ${res.status}`);
        return;
      }
      toast.success("Nếu tài khoản tồn tại và có email, hệ thống đã gửi hướng dẫn đặt lại mật khẩu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4">
      <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6">
        <div className="text-center mb-6">
          <div className="h-12 w-12 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold">Quên mật khẩu</h1>
          <p className="text-sm text-muted-foreground mt-1">Nhập tên đăng nhập — email khôi phục được gửi tới địa chỉ đã lưu trên tài khoản khách hàng.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tên đăng nhập</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              autoComplete="username"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {loading ? "Đang gửi..." : "Gửi email khôi phục"}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/login" className="text-primary font-medium hover:underline">Quay lại đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
