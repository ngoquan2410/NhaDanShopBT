import { Bell, Menu, Search, LogOut, User, Shield, UserCircle, Store, Check, Package, Receipt as ReceiptIcon, Users as UsersIcon, CornerDownLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { dashboardStats, products, invoices, customers } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/admin-auth";

interface AdminTopbarProps {
  onMenuClick: () => void;
}

type SearchHit =
  | { kind: "product"; id: string; title: string; sub: string; href: string }
  | { kind: "invoice"; id: string; title: string; sub: string; href: string }
  | { kind: "customer"; id: string; title: string; sub: string; href: string };

export function AdminTopbar({ onMenuClick }: AdminTopbarProps) {
  const { user, signOut } = useAdminAuth();
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    // Cmd/Ctrl+K to focus search
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const baseNotifications = useMemo(() => [
    ...dashboardStats.lowStockVariants.slice(0, 2).map(v => ({
      id: `low-${v.variantName}`,
      type: "warning" as const,
      title: "Sắp hết hàng",
      desc: `${v.productName} - ${v.variantName} còn ${v.stock}`,
      href: "/admin/inventory",
    })),
    ...dashboardStats.nearExpiryLots.slice(0, 1).map(v => ({
      id: `exp-${v.variantName}`,
      type: "warning" as const,
      title: "Sắp hết hạn",
      desc: `${v.productName} - HSD ${v.expiryDate}`,
      href: "/admin/inventory",
    })),
    { id: "po", type: "info" as const, title: "Đơn chờ thanh toán", desc: `${dashboardStats.pendingOrdersCount} đơn đang chờ`, href: "/admin/pending-orders" },
  ], []);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const notifications = baseNotifications.filter(n => !readIds.has(n.id));

  const handleLogout = async () => {
    await signOut();
    toast.success("Đã đăng xuất");
    setUserOpen(false);
    navigate("/admin/login");
  };

  // Build search results — grouped, lightweight
  const hits: SearchHit[] = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    const productHits: SearchHit[] = products
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.variants.some(v => v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
      )
      .slice(0, 5)
      .map(p => ({
        kind: "product",
        id: p.id,
        title: p.name,
        sub: `${p.code} · ${p.categoryName} · ${p.variants.length} phân loại`,
        href: `/admin/products/${p.id}`,
      }));
    const invoiceHits: SearchHit[] = invoices
      .filter(i => i.number.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q))
      .slice(0, 5)
      .map(i => ({
        kind: "invoice",
        id: i.id,
        title: i.number,
        sub: `${i.customerName} · ${new Date(i.date).toLocaleDateString("vi-VN")}`,
        href: `/admin/invoices?q=${encodeURIComponent(i.number)}`,
      }));
    const customerHits: SearchHit[] = customers
      .filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.code.toLowerCase().includes(q))
      .slice(0, 5)
      .map(c => ({
        kind: "customer",
        id: c.id,
        title: c.name,
        sub: `${c.code} · ${c.phone}`,
        href: `/admin/customers?q=${encodeURIComponent(c.name)}`,
      }));
    return [...productHits, ...invoiceHits, ...customerHits];
  }, [searchQ]);

  useEffect(() => { setActiveIdx(0); }, [searchQ]);

  const goToHit = (h: SearchHit) => {
    setSearchOpen(false);
    setSearchQ("");
    navigate(h.href);
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen) setSearchOpen(true);
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[activeIdx]) goToHit(hits[activeIdx]);
      else if (searchQ.trim()) {
        // Fallback: navigate to products list with the query
        setSearchOpen(false);
        navigate(`/admin/products?q=${encodeURIComponent(searchQ.trim())}`);
        setSearchQ("");
      }
    } else if (e.key === "Escape") setSearchOpen(false);
  };

  const grouped = {
    products: hits.filter(h => h.kind === "product"),
    invoices: hits.filter(h => h.kind === "invoice"),
    customers: hits.filter(h => h.kind === "customer"),
  };

  return (
    <header className="flex items-center h-14 px-4 border-b bg-card shrink-0 gap-3">
      <button onClick={onMenuClick} className="lg:hidden text-muted-foreground hover:text-foreground">
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKey}
            placeholder="Tìm sản phẩm, hóa đơn, khách hàng... (Ctrl+K)"
            className="w-full h-8 pl-9 pr-12 text-sm bg-muted rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground bg-background border rounded px-1 py-0.5">⌘K</kbd>
        </div>

        {searchOpen && searchQ.trim() && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-[60vh] overflow-y-auto animate-fade-in">
            {hits.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Không tìm thấy kết quả cho "{searchQ}"
              </div>
            ) : (
              <>
                {grouped.products.length > 0 && (
                  <SearchGroup label="Sản phẩm" icon={Package}>
                    {grouped.products.map((h, idx) => {
                      const i = hits.indexOf(h);
                      return <SearchItem key={h.id} hit={h} active={i === activeIdx} onClick={() => goToHit(h)} />;
                    })}
                  </SearchGroup>
                )}
                {grouped.invoices.length > 0 && (
                  <SearchGroup label="Hóa đơn" icon={ReceiptIcon}>
                    {grouped.invoices.map(h => {
                      const i = hits.indexOf(h);
                      return <SearchItem key={h.id} hit={h} active={i === activeIdx} onClick={() => goToHit(h)} />;
                    })}
                  </SearchGroup>
                )}
                {grouped.customers.length > 0 && (
                  <SearchGroup label="Khách hàng" icon={UsersIcon}>
                    {grouped.customers.map(h => {
                      const i = hits.indexOf(h);
                      return <SearchItem key={h.id} hit={h} active={i === activeIdx} onClick={() => goToHit(h)} />;
                    })}
                  </SearchGroup>
                )}
                <div className="px-3 py-1.5 border-t bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{hits.length} kết quả</span>
                  <span className="flex items-center gap-1">↑↓ chọn · <CornerDownLeft className="h-3 w-3" /> mở</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Link to="/" className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">
          <Store className="h-3.5 w-3.5" /> Cửa hàng
        </Link>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(o => !o); setUserOpen(false); }}
            className="relative p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
            aria-label="Thông báo"
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 bg-danger text-danger-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-popover border rounded-md shadow-lg z-50 animate-fade-in">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <h3 className="font-semibold text-sm">Thông báo</h3>
                <button
                  onClick={() => {
                    setReadIds(new Set(baseNotifications.map(n => n.id)));
                    toast.success("Đã đánh dấu tất cả là đã đọc");
                  }}
                  disabled={notifications.length === 0}
                  className="text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Check className="h-3 w-3" /> Đã đọc tất cả
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">Không có thông báo mới</div>
                ) : notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setReadIds(prev => new Set([...prev, n.id]));
                      setNotifOpen(false);
                      navigate(n.href);
                    }}
                    className="w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${n.type === "warning" ? "bg-warning" : "bg-primary"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{n.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <Link to="/admin" onClick={() => setNotifOpen(false)} className="block text-center px-3 py-2 text-xs text-primary hover:bg-muted/50 border-t">
                Xem tất cả
              </Link>
            </div>
          )}
        </div>

        {/* User */}
        <div className="relative pl-2 border-l" ref={userRef}>
          <button
            onClick={() => { setUserOpen(o => !o); setNotifOpen(false); }}
            className="flex items-center gap-2 hover:bg-muted rounded-md p-1 transition-colors"
            aria-label="Tài khoản"
          >
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
              <User className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium leading-tight">Admin</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Quản trị viên</p>
            </div>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-popover border rounded-md shadow-lg z-50 animate-fade-in">
              <div className="px-3 py-2 border-b">
                <p className="text-sm font-medium">{user?.email ?? "Admin"}</p>
                <p className="text-[11px] text-muted-foreground">admin · Quản trị viên</p>
              </div>
              <div className="py-1">
                <button onClick={() => { setUserOpen(false); navigate("/admin/users"); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                  <UserCircle className="h-3.5 w-3.5" /> Hồ sơ
                </button>
                <button onClick={() => { setUserOpen(false); navigate("/admin/security"); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                  <Shield className="h-3.5 w-3.5" /> Bảo mật
                </button>
                <Link to="/" onClick={() => setUserOpen(false)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                  <Store className="h-3.5 w-3.5" /> Mở cửa hàng
                </Link>
              </div>
              <div className="border-t py-1">
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-danger-soft text-danger text-left">
                  <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SearchGroup({ label, icon: Icon, children }: { label: string; icon: typeof Package; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 py-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {children}
    </div>
  );
}

function SearchItem({ hit, active, onClick }: { hit: SearchHit; active: boolean; onClick: () => void }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center justify-between gap-2",
        active && "bg-muted"
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{hit.title}</p>
        <p className="text-[11px] text-muted-foreground truncate">{hit.sub}</p>
      </div>
      {active && <CornerDownLeft className="h-3 w-3 text-muted-foreground shrink-0" />}
    </button>
  );
}
