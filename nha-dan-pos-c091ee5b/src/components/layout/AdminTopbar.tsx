import { Bell, Menu, Search, LogOut, User, Shield, UserCircle, Store, Check, Package, Receipt as ReceiptIcon, Users as UsersIcon, CornerDownLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addDays } from "date-fns";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useService } from "@/hooks/useService";
import { adminCustomers, inventory, invoices, pendingOrders, products } from "@/services";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/admin-auth";
import { ADMIN_BADGES_REFRESH_EVENT } from "@/lib/adminBadges";

interface AdminTopbarProps {
  onMenuClick: () => void;
}

type SearchHit =
  | { kind: "product"; id: string; title: string; sub: string; href: string }
  | { kind: "invoice"; id: string; title: string; sub: string; href: string }
  | { kind: "customer"; id: string; title: string; sub: string; href: string };

const EXPIRY_SOON_DAYS = 30;

function parseYmdTopbar(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

function startOfDayTopbar(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function AdminTopbar({ onMenuClick }: AdminTopbarProps) {
  const { user, signOut, primaryRoleLabel } = useAdminAuth();
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
  const { data: topbarData, reload: reloadTopbar } = useService(async () => {
    const [invoicePage, customerRows, inventoryRows, pending] = await Promise.all([
      invoices.list({ page: 1, pageSize: 20 }),
      adminCustomers.list({ pageSize: 50 }),
      inventory.listInventoryProjections(),
      pendingOrders.list({ page: 1, pageSize: 400 }),
    ]);
    const t0 = startOfDayTopbar(new Date());
    const soonUntil = addDays(t0, EXPIRY_SOON_DAYS);
    const expirySoonLots: Array<{ productName: string; variantName: string; expiryDate: string }> = [];
    for (const v of inventoryRows) {
      const productName = v.productName ?? "";
      const variantName = v.variantName ?? v.variantCode ?? "";
      for (const b of v.byBatch ?? []) {
        const expRaw = b.expiryDate;
        if (!expRaw) continue;
        const exp = parseYmdTopbar(expRaw);
        if (!exp) continue;
        if (exp < t0) continue;
        if (exp <= soonUntil) {
          expirySoonLots.push({
            productName,
            variantName,
            expiryDate: expRaw.slice(0, 10),
          });
        }
      }
    }
    expirySoonLots.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    return {
      invoices: invoicePage.items,
      customers: customerRows.items,
      pendingOrdersCount: pending.items.filter(
        (o) => o.status === "pending_payment" || o.status === "waiting_confirm" || o.status === "paid_auto",
      ).length,
      lowStockVariants: inventoryRows
        .filter((v) => {
          if (v.sellableQty == null) return false;
          const a = v.available ?? v.onHand ?? 0;
          const min = v.minStockQty ?? 10;
          return a > 0 && a <= min;
        })
        .slice(0, 2),
      nearExpiryLots: expirySoonLots.slice(0, 3),
    };
  }, []);

  useEffect(() => {
    const onBadges = () => reloadTopbar();
    window.addEventListener(ADMIN_BADGES_REFRESH_EVENT, onBadges);
    return () => window.removeEventListener(ADMIN_BADGES_REFRESH_EVENT, onBadges);
  }, [reloadTopbar]);
  const topbar = topbarData ?? { invoices: [], customers: [], pendingOrdersCount: 0, lowStockVariants: [], nearExpiryLots: [] };

  const debouncedSearchQ = useDebouncedValue(searchQ, 250);
  const [productSearchHits, setProductSearchHits] = useState<
    { id: string; name: string; code: string; categoryName?: string | null; variants: { code: string; name: string }[] }[]
  >([]);

  useEffect(() => {
    const t = debouncedSearchQ.trim();
    if (t.length < 2) {
      setProductSearchHits([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const page = await products.list({ page: 1, pageSize: 8, query: t });
        if (!cancelled) setProductSearchHits(page.items);
      } catch {
        if (!cancelled) setProductSearchHits([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQ]);

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

  const baseNotifications = useMemo(() => {
    const stock = topbar.lowStockVariants.map((v) => ({
      id: `low-${v.variantName}`,
      type: "warning" as const,
      title: "Sắp hết hàng",
      desc: `${v.productName} - ${v.variantName} còn ${v.available ?? v.onHand}`,
      href: "/admin/inventory-report",
    }));
    const expiry = topbar.nearExpiryLots.map((v, idx) => ({
      id: `exp-${idx}-${v.variantName}-${v.expiryDate}`,
      type: "warning" as const,
      title: "Sắp hết hạn",
      desc: `${v.productName} - HSD ${v.expiryDate}`,
      href: "/admin/inventory-report",
    }));
    // Only surface pending-order noise when the API says there are open orders (matches sidebar + pending-orders page).
    const pending =
      topbar.pendingOrdersCount > 0
        ? [
            {
              id: "po",
              type: "info" as const,
              title: "Đơn chờ thanh toán",
              desc: `${topbar.pendingOrdersCount} đơn đang chờ`,
              href: "/admin/pending-orders",
            },
          ]
        : [];
    return [...stock, ...expiry, ...pending];
  }, [topbar]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const notifications = baseNotifications.filter(n => !readIds.has(n.id));

  const handleLogout = async () => {
    await signOut();
    toast.success("Đã đăng xuất");
    setUserOpen(false);
    navigate("/login");
  };

  // Build search results — grouped, lightweight
  const hits: SearchHit[] = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    const productHits: SearchHit[] = productSearchHits.slice(0, 5).map((p) => ({
      kind: "product",
      id: p.id,
      title: p.name,
      sub: `${p.code} · ${p.categoryName ?? "—"} · ${p.variants.length} phân loại`,
      href: `/admin/products/${p.id}`,
    }));
    const invoiceHits: SearchHit[] = topbar.invoices
      .filter(i => i.number.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q))
      .slice(0, 5)
      .map(i => ({
        kind: "invoice",
        id: i.id,
        title: i.number,
        sub: `${i.customerName} · ${new Date(i.date).toLocaleDateString("vi-VN")}`,
        href: `/admin/invoices?q=${encodeURIComponent(i.number)}`,
      }));
    const customerHits: SearchHit[] = topbar.customers
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
  }, [searchQ, topbar, productSearchHits]);

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
              <p className="text-xs font-medium leading-tight">{user?.fullName?.trim() || user?.username || "Tài khoản"}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{primaryRoleLabel}</p>
            </div>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-popover border rounded-md shadow-lg z-50 animate-fade-in">
              <div className="px-3 py-2 border-b">
                <p className="text-sm font-medium">
                  {user?.fullName?.trim() || user?.username || "Admin"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {user?.username ?? "user"} · {primaryRoleLabel}
                </p>
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
