import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatVND, formatDateTime } from "@/lib/format";
import { Clock, LogOut, Save, Loader2, MapPin, User as UserIcon, Users, Plus, Check } from "lucide-react";
import { currentCustomerActions, useCurrentCustomer } from "@/lib/current-customer";
import { customers as customersService, pendingOrders } from "@/services";
import type { Customer, PendingOrder, ShippingAddress } from "@/services/types";
import { AddressSelect, type AddressSelectValue } from "@/components/shared/AddressSelect";
import { toast } from "sonner";

const EMPTY_ADDR: AddressSelectValue = {
  provinceCode: "",
  provinceName: "",
  districtCode: "",
  districtName: "",
  wardCode: "",
  wardName: "",
};

function addrToSelect(a: ShippingAddress | null): AddressSelectValue {
  if (!a) return EMPTY_ADDR;
  return {
    provinceCode: a.provinceCode,
    provinceName: a.provinceName,
    districtCode: a.districtCode,
    districtName: a.districtName,
    wardCode: a.wardCode,
    wardName: a.wardName,
  };
}

export default function AccountPage() {
  const { customer, defaultAddress, loading } = useCurrentCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [addr, setAddr] = useState<AddressSelectValue>(EMPTY_ADDR);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState<PendingOrder[]>([]);

  // Profile switcher: list every persisted customer so the device can hop
  // between them without losing data. Refreshed whenever the active id changes.
  const [allProfiles, setAllProfiles] = useState<Customer[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  useEffect(() => {
    void customersService.list({ pageSize: 200 }).then((res) => setAllProfiles(res.items));
  }, [customer?.id]);

  const switchProfile = async (id: string) => {
    if (id === customer?.id) {
      setSwitcherOpen(false);
      return;
    }
    await currentCustomerActions.switchTo(id);
    setSwitcherOpen(false);
    toast.success("Đã chuyển sang hồ sơ khác");
  };

  const createNewProfile = async () => {
    await currentCustomerActions.createAndSwitch();
    setSwitcherOpen(false);
    toast.success("Đã tạo hồ sơ trống mới");
  };

  // Hydrate form from CustomerService once customer is loaded.
  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    setPhone(customer.phone);
    setEmail(customer.email ?? "");
    setStreet(defaultAddress?.street ?? "");
    setAddr(addrToSelect(defaultAddress));
  }, [customer, defaultAddress]);

  // Load this device's pending orders by phone match.
  useEffect(() => {
    if (!customer?.phone) {
      setOrders([]);
      return;
    }
    void pendingOrders.list({ pageSize: 50 }).then((res) => {
      setOrders(
        res.items
          .filter((o) => o.customerPhone === customer.phone)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      );
    });
  }, [customer?.phone]);

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending_payment" || o.status === "waiting_confirm").length,
    [orders]
  );

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập họ tên và số điện thoại");
      return;
    }
    setSaving(true);
    try {
      await currentCustomerActions.save({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
      });
      const fullAddr: ShippingAddress | null =
        addr.provinceCode && addr.districtCode && addr.wardCode
          ? {
              receiverName: name.trim(),
              phone: phone.trim(),
              provinceCode: addr.provinceCode,
              provinceName: addr.provinceName,
              districtCode: addr.districtCode,
              districtName: addr.districtName,
              wardCode: addr.wardCode,
              wardName: addr.wardName,
              street: street.trim(),
            }
          : null;
      currentCustomerActions.saveDefaultAddress(fullAddr);
      toast.success("Đã lưu thông tin tài khoản");
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    currentCustomerActions.signOut();
    toast.success("Đã đăng xuất khỏi thiết bị này");
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const totalSpent = orders
    .filter((o) => o.status === "confirmed")
    .reduce((s, o) => s + o.pricingBreakdownSnapshot.total, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Profile header */}
      <div className="bg-card rounded-lg border p-5 relative">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 bg-primary-soft rounded-full flex items-center justify-center text-lg font-bold text-primary shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">{name || "Chưa đặt tên"}</h1>
            <p className="text-sm text-muted-foreground">
              {phone || "Chưa có số điện thoại"} · {customer?.points ?? 0} điểm
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSwitcherOpen((o) => !o)}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-semibold hover:bg-muted"
            aria-haspopup="menu"
            aria-expanded={switcherOpen}
          >
            <Users className="h-3.5 w-3.5" /> Đổi hồ sơ
          </button>
        </div>

        {switcherOpen && (
          <div className="absolute right-5 top-16 z-20 w-72 max-h-80 overflow-auto bg-card border rounded-lg shadow-lg p-1.5">
            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Hồ sơ trên thiết bị này ({allProfiles.length})
            </p>
            {allProfiles.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">Chưa có hồ sơ nào.</p>
            )}
            {allProfiles.map((p) => {
              const active = p.id === customer?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => switchProfile(p.id)}
                  className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-muted text-sm"
                >
                  <div className="h-7 w-7 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(p.name || "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name || "Hồ sơ chưa đặt tên"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.phone || "Chưa có SĐT"} · {p.points ?? 0} điểm
                    </p>
                  </div>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
            <div className="border-t mt-1 pt-1">
              <button
                type="button"
                onClick={createNewProfile}
                className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-muted text-sm font-medium text-primary"
              >
                <Plus className="h-4 w-4" /> Tạo hồ sơ trống mới
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-muted rounded-md p-3 text-center">
            <p className="text-xs text-muted-foreground">Đơn hàng</p>
            <p className="text-lg font-bold">{orders.length}</p>
          </div>
          <div className="bg-muted rounded-md p-3 text-center">
            <p className="text-xs text-muted-foreground">Đã chi tiêu</p>
            <p className="text-lg font-bold text-primary">{formatVND(totalSpent)}</p>
          </div>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-warning-soft rounded-lg border border-warning/20">
          <Clock className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning">
            Bạn có {pendingCount} đơn hàng đang chờ thanh toán
          </p>
          <Link
            to={`/pending-payment/${orders.find((o) => o.status === "pending_payment" || o.status === "waiting_confirm")?.id ?? ""}`}
            className="ml-auto text-xs font-medium text-warning hover:underline"
          >
            Xem
          </Link>
        </div>
      )}

      {/* Editable profile */}
      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Thông tin cá nhân</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Họ và tên *" value={name} onChange={setName} placeholder="Nguyễn Văn A" />
            <Field label="Số điện thoại *" value={phone} onChange={setPhone} placeholder="0901234567" />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="ban@example.com" />
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">Địa chỉ giao hàng mặc định</p>
          </div>
          <AddressSelect value={addr} onChange={setAddr} />
          <div className="mt-3">
            <Field label="Số nhà, đường" value={street} onChange={setStreet} placeholder="VD: 12 Lê Lợi" />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-10 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu thay đổi
          </button>
        </div>
      </div>

      {/* Order history */}
      <div className="bg-card rounded-lg border">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Đơn hàng gần đây</h2>
        </div>
        {orders.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Chưa có đơn hàng nào.
          </div>
        ) : (
          <div className="divide-y">
            {orders.slice(0, 10).map((o) => (
              <Link
                to={`/pending-payment/${o.id}`}
                key={o.id}
                className="block px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-medium">{o.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)} · {o.lines.length} sản phẩm
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{formatVND(o.pricingBreakdownSnapshot.total)}</p>
                    <div className="mt-0.5">
                      <StatusBadge
                        status={
                          o.status === "confirmed"
                            ? "confirmed"
                            : o.status === "cancelled"
                              ? "cancelled"
                              : "pending"
                        }
                      />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium border text-danger hover:bg-danger-soft transition-colors"
      >
        <LogOut className="h-4 w-4" /> Đăng xuất khỏi thiết bị
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full h-11 px-3.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
      />
    </div>
  );
}
