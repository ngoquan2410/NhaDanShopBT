import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, KeyRound, CheckCircle, Eye, EyeOff, QrCode } from "lucide-react";

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showPw, setShowPw] = useState(false);

  if (step === 3) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4">
        <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6 text-center">
          <div className="h-14 w-14 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-lg font-bold">Đăng ký thành công!</h1>
          <p className="text-sm text-muted-foreground mt-2">Tài khoản đã được tạo và bảo mật bằng TOTP.</p>
          <Link to="/login" className="mt-5 w-full inline-flex items-center justify-center py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors">
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4">
        <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-5">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= 2 ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
          <div className="text-center mb-5">
            <div className="h-12 w-12 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold">Thiết lập bảo mật</h1>
            <p className="text-sm text-muted-foreground mt-1">Quét mã QR bằng ứng dụng xác thực (Google Authenticator, Authy...)</p>
          </div>
          <div className="bg-muted rounded-lg p-6 flex items-center justify-center mb-4">
            <div className="h-32 w-32 bg-card rounded border-2 border-dashed border-border flex items-center justify-center">
              <QrCode className="h-16 w-16 text-muted-foreground/30" />
            </div>
          </div>
          <div className="text-center mb-4">
            <p className="text-[11px] text-muted-foreground">Hoặc nhập mã thủ công:</p>
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1 inline-block">JBSWY3DPEHPK3PXP</code>
          </div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Nhập mã xác thực</p>
          <div className="flex gap-2 justify-center mb-4">
            {[...Array(6)].map((_, i) => (
              <input key={i} type="text" maxLength={1} className="w-10 h-12 text-center text-lg font-bold border-2 rounded-lg bg-background focus:outline-none focus:border-primary" />
            ))}
          </div>
          <button onClick={() => setStep(3)} className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors">
            Xác nhận
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-storefront-bg px-4">
      <div className="w-full max-w-sm bg-card rounded-xl border shadow-sm p-6">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= 1 ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
        <div className="text-center mb-5">
          <div className="h-12 w-12 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground mt-1">Đăng ký tài khoản NhaDanShop</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tên đăng nhập *</label>
            <input placeholder="Nhập tên đăng nhập" className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Họ tên</label>
            <input placeholder="Nhập họ tên (tùy chọn)" className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mật khẩu *</label>
            <div className="relative mt-1">
              <input type={showPw ? "text" : "password"} placeholder="Tối thiểu 8 ký tự" className="w-full h-10 px-3 pr-10 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Xác nhận mật khẩu *</label>
            <input type="password" placeholder="Nhập lại mật khẩu" className="mt-1 w-full h-10 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
        <button onClick={() => setStep(2)} className="mt-4 w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary-hover transition-colors">
          Tiếp tục
        </button>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Đã có tài khoản? <Link to="/login" className="text-primary font-medium hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
