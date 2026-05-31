import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ADMIN_BADGES_REFRESH_EVENT } from "@/lib/adminBadges";
import { paymentEvents, pendingOrders } from "@/services";
import { useAdminAuth } from "@/lib/admin-auth";
import {
  LayoutDashboard, FolderTree, Package, Layers, Factory, FileInput, Receipt,
  ShoppingCart, Clock, Tags, Users, Truck, ClipboardCheck,
  BarChart3, TrendingUp, DollarSign, UserCog, Shield,
  ChevronLeft, ChevronRight, Menu, X, Settings, MapPin,
  AlertCircle,
} from "lucide-react";
import { BrandLogo } from "@/components/branding/BrandLogo";

const navGroups = [
  {
    label: "Tổng quan",
    items: [
      { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    ]
  },
  {
    label: "Sản phẩm",
    items: [
      { path: "/admin/categories", icon: FolderTree, label: "Danh mục" },
      { path: "/admin/products", icon: Package, label: "Sản phẩm" },
      { path: "/admin/combos", icon: Layers, label: "Combo" },
    ]
  },
  {
    label: "Bán hàng",
    items: [
      { path: "/admin/pos", icon: ShoppingCart, label: "POS / Tạo hóa đơn" },
      { path: "/admin/invoices", icon: Receipt, label: "Hóa đơn" },
      { path: "/admin/pending-orders", icon: Clock, label: "Đơn chờ thanh toán", badgeKey: "pending_orders" as const },
      { path: "/admin/unmatched-payments", icon: AlertCircle, label: "Giao dịch chưa khớp", badgeKey: "unmatched" as const },
      { path: "/admin/promotions", icon: Tags, label: "Khuyến mãi" },
      { path: "/admin/vouchers", icon: Tags, label: "Voucher" },
    ]
  },
  {
    label: "Kho hàng",
    items: [
      { path: "/admin/goods-receipts", icon: FileInput, label: "Phiếu nhập" },
      { path: "/admin/production", icon: Factory, label: "Sản xuất" },
      { path: "/admin/stock-adjustments", icon: ClipboardCheck, label: "Kiểm kho / Điều chỉnh" },
      { path: "/admin/inventory-report", icon: BarChart3, label: "Báo cáo tồn kho" },
    ]
  },
  {
    label: "Báo cáo",
    items: [
      { path: "/admin/revenue", icon: TrendingUp, label: "Doanh thu" },
      { path: "/admin/profit", icon: DollarSign, label: "Lợi nhuận" },
    ]
  },
  {
    label: "Đối tác",
    items: [
      { path: "/admin/customers", icon: Users, label: "Khách hàng" },
      { path: "/admin/suppliers", icon: Truck, label: "Nhà cung cấp" },
    ]
  },
  {
    label: "Hệ thống",
    items: [
      { path: "/admin/store-settings", icon: Settings, label: "Cài đặt cửa hàng" },
      { path: "/admin/shipping-settings", icon: MapPin, label: "Cài đặt giao hàng" },
      { path: "/admin/ghn-quote-logs", icon: ClipboardCheck, label: "Nhật ký GHN" },
      { path: "/admin/users", icon: UserCog, label: "Người dùng" },
      { path: "/admin/security", icon: Shield, label: "Bảo mật" },
    ]
  },
];

export function filterNavGroupsForRole(isAdmin: boolean, isStaff: boolean) {
  if (isStaff && !isAdmin) {
    return navGroups
      .filter((group) => group.label === "Bán hàng")
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          ["/admin/pos", "/admin/invoices", "/admin/pending-orders"].includes(item.path),
        ),
      }));
  }
  return navGroups;
}

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: AdminSidebarProps) {
  const location = useLocation();
  const { isAdmin, isStaff } = useAdminAuth();
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  // Poll backend counts on an interval instead of using browser realtime channels.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const n = await paymentEvents.countUnmatched();
        if (alive) setUnmatchedCount(n);
      } catch {
        /* unauthenticated or offline → just hide the badge */
      }
      try {
        const p = await pendingOrders.list({ page: 1, pageSize: 500 });
        const list = p.items ?? [];
        const c = list.filter(
          (o) => o.status === "pending_payment" || o.status === "waiting_confirm" || o.status === "paid_auto",
        ).length;
        if (alive) setPendingCount(c);
      } catch {
        if (alive) setPendingCount(0);
      }
    };
    void tick();
    const onBadges = () => void tick();
    window.addEventListener(ADMIN_BADGES_REFRESH_EVENT, onBadges);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(ADMIN_BADGES_REFRESH_EVENT, onBadges);
    };
  }, []);

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  const badgeFor = (item: { badgeKey?: "unmatched" | "pending_orders"; badge?: number }): number | undefined => {
    if (item.badgeKey === "unmatched") return unmatchedCount > 0 ? unmatchedCount : undefined;
    if (item.badgeKey === "pending_orders") return pendingCount > 0 ? pendingCount : undefined;
    return item.badge;
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0", collapsed && "justify-center px-2")}>
        <Link
          to="/admin"
          onClick={onMobileClose}
          className={cn("flex min-w-0 items-center", collapsed ? "justify-center" : "w-full")}
          aria-label="Nhã Đan Shop Admin"
        >
          {collapsed ? (
            <BrandLogo variant="mark" className="h-8 w-8 rounded-lg" />
          ) : (
            <BrandLogo variant="compact" className="h-10 max-w-[152px]" />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2 space-y-4">
        {filterNavGroupsForRole(isAdmin, isStaff).map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const badgeValue = badgeFor(item);
                return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onMobileClose}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    isActive(item.path)
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {badgeValue && (
                        <span className="ml-auto text-[10px] bg-danger text-danger-foreground rounded-full px-1.5 py-0.5 font-semibold">
                          {badgeValue}
                        </span>
                      )}
                    </>
                  )}
                </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="hidden lg:flex items-center justify-center border-t border-sidebar-border h-10 shrink-0">
        <button onClick={onToggle} className="text-sidebar-muted hover:text-sidebar-foreground transition-colors">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onMobileClose} />
          <div className="fixed inset-y-0 left-0 w-64 bg-sidebar z-50 animate-slide-in-right shadow-xl">
            <div className="absolute top-3 right-3">
              <button onClick={onMobileClose} className="text-sidebar-muted hover:text-sidebar-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}>
        {sidebarContent}
      </aside>
    </>
  );
}
