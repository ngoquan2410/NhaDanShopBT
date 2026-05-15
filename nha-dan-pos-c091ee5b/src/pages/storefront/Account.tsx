import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { formatVND, formatDateTime } from "@/lib/format";
import { LogOut, Save, Loader2, User as UserIcon, Coins, Clock } from "lucide-react";
import { ChangePasswordPanel } from "@/components/auth/ChangePasswordPanel";
import { TotpSettingsPanel } from "@/components/auth/TotpSettingsPanel";
import { toast } from "sonner";
import { useAuth } from "@/lib/admin-auth";
import { accountApi, type AccountMe, type AccountOrder, type PointHistoryRow } from "@/services/account/accountApi";
import type { PendingOrder } from "@/services/types";

export default function AccountPage() {
  const auth = useAuth();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<AccountMe | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [history, setHistory] = useState<PointHistoryRow[]>([]);

  useEffect(() => {
    if (!auth.session) return;
    let alive = true;
    setLoading(true);
    Promise.all([accountApi.me(), accountApi.orders(), accountApi.pendingOrders(), accountApi.history()])
      .then(([m, o, p, h]) => {
        if (!alive) return;
        setMe(m);
        setOrders(o);
        setPendingOrders(p);
        setHistory(h);
        setName(m.customerName ?? m.fullName ?? "");
        setPhone(m.phone ?? "");
        setEmail(m.email ?? "");
        setAddress(m.address ?? "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Không tải được tài khoản"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [auth.session]);

  if (auth.loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  }
  if (!auth.session) return <Navigate to="/login?next=/account" replace />;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập họ tên");
      return;
    }
    setSaving(true);
    try {
      const next = await accountApi.updateProfile({
        fullName: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });
      setMe(next);
      toast.success("Đã lưu thông tin tài khoản");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    toast.success("Đã đăng xuất");
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;
  }

  const initial = (name || me?.username || "?").trim().charAt(0).toUpperCase();
  const totalSpent = orders.reduce((s, o) => s + Number(o.totalAmount ?? 0) - Number(o.discountAmount ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="bg-card rounded-lg border p-5">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 bg-primary-soft rounded-full flex items-center justify-center text-lg font-bold text-primary shrink-0">{initial}</div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">{name || me?.username}</h1>
            <p className="text-sm text-muted-foreground">{phone || "Chưa có số điện thoại"} · {me?.points?.availablePoints ?? 0} điểm khả dụng</p>
          </div>
          <button onClick={handleSignOut} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-semibold hover:bg-muted"><LogOut className="h-3.5 w-3.5" /> Đăng xuất</button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <SummaryBox label="Đơn hàng" value={orders.length} />
          <SummaryBox label="Đã chi tiêu" value={formatVND(totalSpent)} emphasis />
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold text-sm">Thông tin cá nhân</h2></div>
        <div className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ và tên *" value={name} onChange={setName} placeholder="Nguyễn Văn A" />
            <Field label="Số điện thoại" value={phone} onChange={setPhone} placeholder="0901234567" />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="ban@example.com" />
          <Field label="Địa chỉ" value={address} onChange={setAddress} placeholder="Địa chỉ liên hệ" />
          <button onClick={handleSave} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu thay đổi
          </button>
        </div>
      </div>

      <ChangePasswordPanel layout="comfortable" />

      <TotpSettingsPanel layout="comfortable" />

      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b flex items-center gap-2"><Coins className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold text-sm">Điểm tích lũy</h2></div>
        <div className="grid grid-cols-2 gap-3 p-4 text-center">
          <SummaryBox label="Số dư" value={me?.points?.pointBalance ?? 0} emphasis />
          <SummaryBox label="Đang giữ" value={me?.points?.pointReserved ?? 0} />
          <SummaryBox label="Khả dụng" value={me?.points?.availablePoints ?? 0} emphasis />
          <SummaryBox label="Đã tích / đã đổi" value={`${me?.points?.lifetimePointsEarned ?? 0} / ${me?.points?.lifetimePointsRedeemed ?? 0}`} />
        </div>
        <div className="border-t divide-y">
          {history.length === 0 && <div className="px-4 py-6 text-center text-xs text-muted-foreground">Chưa có lịch sử điểm.</div>}
          {history.slice(0, 10).map((h) => (
            <div key={h.id} className="px-4 py-3 flex justify-between gap-3 text-sm">
              <div><p className="font-medium">{h.type}{h.reason ? ` · ${h.reason}` : ""}</p><p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p></div>
              <p className={h.pointsDelta >= 0 ? "font-bold text-success" : "font-bold text-danger"}>{h.pointsDelta > 0 ? "+" : ""}{h.pointsDelta}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b flex items-center gap-2"><Clock className="h-4 w-4 text-warning" /><h2 className="font-semibold text-sm">Đơn chờ thanh toán</h2></div>
        {pendingOrders.length === 0 ? <div className="px-4 py-6 text-center text-xs text-muted-foreground">Không có đơn chờ thanh toán.</div> : (
          <div className="divide-y">
            {pendingOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium truncate">{o.code}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)} · {o.paymentMethod}</p>
                  {o.expiresAt && <p className="text-[11px] text-warning">Hết hạn {formatDateTime(o.expiresAt)}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">{formatVND(o.pricingBreakdownSnapshot.total)}</p>
                  <Link to={`/pending-payment/${o.id}`} className="mt-1 inline-flex items-center justify-center h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover">
                    Thanh toán tiếp
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b"><h2 className="font-semibold text-sm">Đơn hàng gần đây</h2></div>
        {orders.length === 0 ? <div className="px-4 py-8 text-center text-xs text-muted-foreground">Chưa có đơn hàng nào.</div> : (
          <div className="divide-y">
            {orders.slice(0, 10).map((o) => (
              <div key={o.id} className="px-4 py-3 flex items-start justify-between gap-2">
                <div><p className="font-mono text-xs font-medium">{o.invoiceNo}</p><p className="text-xs text-muted-foreground">{formatDateTime(o.invoiceDate)} · {o.paymentMethod ?? ""}</p></div>
                <div className="text-right"><p className="font-bold text-sm">{formatVND(o.totalAmount - o.discountAmount)}</p>{o.loyaltyRedeemedPoints > 0 && <p className="text-[11px] text-primary">Đổi {o.loyaltyRedeemedPoints} điểm</p>}<p className="text-[11px] text-muted-foreground">{o.status}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryBox({ label, value, emphasis = false }: { label: string; value: number | string; emphasis?: boolean }) {
  return <div className="bg-muted rounded-md p-3 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className={emphasis ? "text-lg font-bold text-primary" : "text-lg font-bold"}>{value}</p></div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><label className="text-xs font-semibold text-muted-foreground">{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full h-11 px-3.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50" /></div>;
}
