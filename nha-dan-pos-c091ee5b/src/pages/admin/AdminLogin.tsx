// Dedicated admin login (Supabase auth). Separate from /login (customer mock).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, LogIn, UserPlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/lib/admin-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const { signIn, signUp, session, isAdmin, loading, refreshRole } = useAdminAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // If a session already exists with admin role, jump straight to /admin.
  useEffect(() => {
    if (loading) return;
    if (session && isAdmin) navigate("/admin", { replace: true });
  }, [loading, session, isAdmin, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = mode === "signin" ? signIn : signUp;
      const res = await fn(email.trim(), password);
      if (res.error) {
        setError(res.error);
        return;
      }
      // After signup, attempt to claim admin (no-op if one already exists).
      if (mode === "signup") {
        const { data, error: rpcError } = await supabase.rpc("bootstrap_admin");
        if (rpcError) {
          console.warn("bootstrap_admin failed", rpcError);
        } else if (data === true) {
          toast.success("Đã tạo tài khoản admin đầu tiên cho cửa hàng");
        } else {
          toast.success("Đã tạo tài khoản — chờ admin hiện tại cấp quyền");
        }
        await refreshRole();
      } else {
        toast.success("Đăng nhập thành công");
      }
    } finally {
      setBusy(false);
    }
  };

  // Logged in but not admin → show explanation instead of redirecting away.
  if (!loading && session && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-3">
          <AlertCircle className="h-10 w-10 mx-auto text-warning" />
          <h1 className="font-bold text-lg">Tài khoản chưa có quyền admin</h1>
          <p className="text-sm text-muted-foreground">
            Tài khoản <strong>{session.user.email}</strong> đã đăng nhập nhưng chưa được cấp role admin.
            Hãy báo user_id sau cho người setup hệ thống để gắn role:
          </p>
          <code className="block text-xs bg-muted p-2 rounded break-all select-all">
            {session.user.id}
          </code>
          <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
            Tải lại sau khi đã được cấp quyền
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="max-w-md w-full bg-card border rounded-lg p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-bold text-xl">Quản trị Nhã Đan Shop</h1>
          <p className="text-xs text-muted-foreground">
            {mode === "signin"
              ? "Đăng nhập tài khoản admin để tiếp tục"
              : "Tạo tài khoản admin đầu tiên cho cửa hàng"}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@shop.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Mật khẩu</Label>
            <Input
              id="admin-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded-md p-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {mode === "signin" ? <LogIn className="h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            {busy ? "Đang xử lý..." : mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
          </Button>
        </form>

        <div className="text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>
              Chưa có tài khoản admin?{" "}
              <button onClick={() => { setMode("signup"); setError(null); }} className="text-primary font-medium hover:underline">
                Đăng ký
              </button>
            </>
          ) : (
            <>
              Đã có tài khoản?{" "}
              <button onClick={() => { setMode("signin"); setError(null); }} className="text-primary font-medium hover:underline">
                Đăng nhập
              </button>
            </>
          )}
        </div>

        <div className="text-center pt-2 border-t">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Về trang chủ cửa hàng
          </Link>
        </div>
      </div>
    </div>
  );
}
