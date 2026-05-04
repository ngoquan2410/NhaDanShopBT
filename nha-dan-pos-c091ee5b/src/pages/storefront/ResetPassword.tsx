import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { isPasswordValid } from "@/lib/passwordPolicy";

function mapResetPasswordError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("hết hạn")) return "Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng gửi lại email từ mục quên mật khẩu.";
  if (m.includes("đã được sử dụng")) return "Liên kết này đã được dùng. Vui lòng đăng nhập hoặc yêu cầu gửi email đặt lại mật khẩu mới.";
  if (m.includes("không hợp lệ")) return "Liên kết không hợp lệ. Hãy mở đúng nút trong email hoặc yêu cầu gửi lại.";
  return message;
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Thiếu liên kết hợp lệ — hãy mở trang từ email hoặc nút «Đặt lại mật khẩu».");
      return;
    }
    if (!isPasswordValid(password, "")) return toast.error("Mật khẩu chưa đủ mạnh theo quy định.");
    if (password !== confirm) return toast.error("Xác nhận mật khẩu không khớp");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const raw = (data?.detail ?? data?.message ?? `Lỗi ${res.status}`) as string;
        toast.error(mapResetPasswordError(String(raw)));
        return;
      }
      toast.success("Đã đặt lại mật khẩu — vui lòng đăng nhập lại.");
      window.location.href = "/login";
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
          <h1 className="text-lg font-bold">Đặt lại mật khẩu</h1>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {!token && (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md p-2">
              Không tìm thấy mã trong đường dẫn. Hãy mở liên kết đầy đủ từ email (hoặc dùng chức năng quên mật khẩu để nhận email mới).
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mật khẩu mới</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Xác nhận</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 transition-colors"
          >
            {loading ? "Đang lưu..." : "Đặt lại mật khẩu"}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          <Link to="/login" className="text-primary font-medium hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
