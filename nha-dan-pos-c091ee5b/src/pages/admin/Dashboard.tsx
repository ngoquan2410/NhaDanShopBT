import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatVND, formatDate } from "@/lib/format";
import { dashboardStats } from "@/lib/mock-data";
import {
  TrendingUp, DollarSign, ShoppingCart, Clock, AlertTriangle, Package,
  FileInput, ClipboardCheck, Receipt, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  const s = dashboardStats;

  return (
    <div className="space-y-5 admin-dense">
      <PageHeader title="Dashboard" description="Tổng quan hoạt động kinh doanh" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={TrendingUp} title="Doanh thu tuần" value={formatVND(s.revenueThisWeek)} variant="primary" trend={{ value: "+12%", positive: true }} />
        <StatCard icon={TrendingUp} title="Doanh thu tháng" value={formatVND(s.revenueThisMonth)} />
        <StatCard icon={DollarSign} title="Lợi nhuận tuần" value={formatVND(s.profitThisWeek)} variant="success" trend={{ value: "+8%", positive: true }} />
        <StatCard icon={DollarSign} title="Lợi nhuận tháng" value={formatVND(s.profitThisMonth)} />
      </div>

      {/* Quick actions + pending */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Quick actions */}
        <div className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold text-sm mb-3">Thao tác nhanh</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Tạo hóa đơn", icon: ShoppingCart, path: "/admin/pos", color: "bg-primary text-primary-foreground" },
              { label: "Tạo phiếu nhập", icon: FileInput, path: "/admin/goods-receipts/create", color: "bg-success text-success-foreground" },
              { label: "Đơn chờ TT", icon: Clock, path: "/admin/pending-orders", color: "bg-warning text-warning-foreground" },
              { label: "Kiểm kho", icon: ClipboardCheck, path: "/admin/stock-adjustments", color: "bg-info text-info-foreground" },
            ].map(a => (
              <Link key={a.path} to={a.path} className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-xs font-medium transition-opacity hover:opacity-90 ${a.color}`}>
                <a.icon className="h-4 w-4" />
                {a.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Pending orders */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Đơn chờ thanh toán</h2>
            <StatusBadge status="pending" label={`${s.pendingOrdersCount} đơn`} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-warning-soft rounded-md">
              <div>
                <p className="text-xs font-medium">DH-20250415-001</p>
                <p className="text-[10px] text-muted-foreground">Trần Thị Bình — Chuyển khoản</p>
              </div>
              <span className="text-xs font-bold text-warning">{formatVND(320000)}</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-warning-soft rounded-md">
              <div>
                <p className="text-xs font-medium">DH-20250415-002</p>
                <p className="text-[10px] text-muted-foreground">Võ Thị Em — MoMo</p>
              </div>
              <span className="text-xs font-bold text-warning">{formatVND(185000)}</span>
            </div>
          </div>
          <Link to="/admin/pending-orders" className="mt-3 flex items-center gap-1 text-xs text-primary font-medium hover:underline">
            Xem tất cả <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Today summary */}
        <div className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold text-sm mb-3">Hôm nay</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hóa đơn</span>
              <span className="font-bold">{s.invoiceCountToday}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Doanh thu</span>
              <span className="font-bold">{formatVND(2850000)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Đơn chờ</span>
              <span className="font-bold text-warning">{s.pendingOrdersCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Low stock */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="font-semibold text-sm">Sắp hết hàng ({s.lowStockVariants.length})</h2>
          </div>
          <div className="space-y-1.5">
            {s.lowStockVariants.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div>
                  <span className="font-medium">{v.productName}</span>
                  <span className="text-muted-foreground"> — {v.variantName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="low-stock" label={`${v.stock}/${v.minStock}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Out of stock + expiry */}
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-danger" />
            <h2 className="font-semibold text-sm">Hết hàng ({s.outOfStockVariants.length})</h2>
          </div>
          <div className="space-y-1.5">
            {s.outOfStockVariants.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div>
                  <span className="font-medium">{v.productName}</span>
                  <span className="text-muted-foreground"> — {v.variantName}</span>
                </div>
                <StatusBadge status="out-of-stock" />
              </div>
            ))}
          </div>
          {s.nearExpiryLots.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-semibold text-warning mb-1.5">⚠ Sắp hết hạn</p>
              {s.nearExpiryLots.map((v, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{v.productName} — {v.variantName}</span>
                  <StatusBadge status="near-expiry" label={formatDate(v.expiryDate)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
