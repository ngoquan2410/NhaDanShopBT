import { StatusBadge } from "@/components/shared/StatusBadge";
import { User, KeyRound, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showOtp, setShowOtp] = useState(false);

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
          <div className="flex gap-2 justify-center mb-4">
            {[...Array(6)].map((_, i) => (
              <input
                key={i}
                type="text"
                maxLength={1}
                className="w-10 h-12 text-center text-lg font-bold border-2 rounded-lg bg-background focus:outline-none focus:border-primary transition-colors"
              />
            ))}
          </div>
          <button className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors">
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
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tên đăng nhập</label>
            <input placeholder="Nhập tên đăng nhập" className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mật khẩu</label>
            <div className="relative mt-1">
              <input type={showPassword ? "text" : "password"} placeholder="Nhập mật khẩu" className="w-full h-10 px-3 pr-10 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <button onClick={() => setShowOtp(true)} className="mt-4 w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors">
          Đăng nhập
        </button>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Chưa có tài khoản? <Link to="/signup" className="text-primary font-medium hover:underline">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}
