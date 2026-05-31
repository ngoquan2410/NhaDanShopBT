import { Link, useLocation, useNavigate } from "react-router-dom";
import { CornerDownLeft, Home, Search, ShoppingCart, User, Layers, Menu, X, LogOut, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/admin-auth";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { listPublicProductsPage, type StorefrontProduct } from "@/services/catalog/publicCatalog";
import { BrandLogo } from "@/components/branding/BrandLogo";

interface NavItem {
  path: string;
  icon: typeof Home;
  label: string;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  { path: "/", icon: Home, label: "Trang chủ" },
  { path: "/products", icon: Search, label: "Sản phẩm" },
  { path: "/combos", icon: Layers, label: "Combo" },
];

const STOREFRONT_SEARCH_PAGE_SIZE = 20;

export function StorefrontNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHits, setSearchHits] = useState<StorefrontProduct[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeSearchIdx, setActiveSearchIdx] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchReqIdRef = useRef(0);
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchInput.trim();
    setSearchOpen(false);
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
  };
  const cartItems = useCart();
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const loggedIn = !!auth.session && !auth.loading;
  const showName = (auth.session?.fullName?.trim() || auth.session?.username || "").trim();

  const accountPath = loggedIn ? "/account" : "/login";
  const accountLabel = loggedIn ? "Tài khoản" : "Đăng nhập";

  const bottomNavItems: NavItem[] = [
    ...mainNavItems,
    { path: "/cart", icon: ShoppingCart, label: "Giỏ hàng", badge: cartCount > 0 ? cartCount : undefined },
    { path: accountPath, icon: User, label: accountLabel },
  ];

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const accountTabActive =
    location.pathname.startsWith("/account") || location.pathname.startsWith("/login");

  const handleSignOut = async () => {
    await auth.signOut();
    toast.success("Đã đăng xuất");
    navigate("/", { replace: true });
  };

  useEffect(() => {
    const term = debouncedSearch.trim();
    const reqId = ++searchReqIdRef.current;
    if (term.length < 2) {
      setSearchHits([]);
      setSearchTotal(0);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    listPublicProductsPage({ search: term, page: 0, size: STOREFRONT_SEARCH_PAGE_SIZE, sort: "name,asc" })
      .then((page) => {
        if (reqId !== searchReqIdRef.current) return;
        setSearchHits(page.items);
        setSearchTotal(page.totalElements ?? page.items.length);
      })
      .catch(() => {
        if (reqId !== searchReqIdRef.current) return;
        setSearchHits([]);
        setSearchTotal(0);
      })
      .finally(() => {
        if (reqId !== searchReqIdRef.current) return;
        setSearchLoading(false);
      });
  }, [debouncedSearch]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    setActiveSearchIdx(0);
  }, [searchInput]);

  const goToSearchHit = (product: StorefrontProduct) => {
    setSearchOpen(false);
    navigate(`/products/${product.id}`);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen) setSearchOpen(true);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchIdx((idx) => Math.min(idx + 1, Math.max(searchHits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIdx((idx) => Math.max(idx - 1, 0));
    } else if (event.key === "Enter" && searchHits[activeSearchIdx]) {
      event.preventDefault();
      goToSearchHit(searchHits[activeSearchIdx]);
    } else if (event.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const renderMatchedVariant = (product: StorefrontProduct) => {
    const q = searchInput.trim().toLowerCase();
    const match = q
      ? product.variants.find((v) => v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
      : undefined;
    if (!match) return null;
    return <span className="block truncate text-[11px] text-muted-foreground">Phân loại: {match.name || "Mặc định"} · {match.code}</span>;
  };
  const searchOverflowCount = searchHits.length > 0 ? Math.max(0, searchTotal - searchHits.length) : 0;

  return (
    <>
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/60">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0">
          <Link to="/" className="order-1 flex shrink-0 items-center group" aria-label="Nhã Đan Shop">
            <BrandLogo variant="compact" className="h-10 max-w-[150px] transition-transform group-hover:scale-[1.01] lg:hidden" />
            <BrandLogo variant="horizontal" className="hidden h-11 max-w-[190px] transition-transform group-hover:scale-[1.01] lg:block xl:max-w-[220px]" />
          </Link>

          <nav className="order-2 ml-1 hidden items-center gap-1 lg:flex">
            {mainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "px-3 py-1.5 text-sm font-semibold rounded-full transition-colors whitespace-nowrap",
                  isActive(item.path)
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div ref={searchBoxRef} className="relative order-5 w-full sm:order-3 sm:min-w-[220px] sm:flex-1 lg:max-w-xs xl:max-w-sm">
            <form onSubmit={submitSearch} role="search" className="relative block">
              <span className="sr-only">Tìm sản phẩm</span>
              <button
                type="submit"
                aria-label="Tìm kiếm"
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full"
              >
                <Search className="h-4 w-4" />
              </button>
              <input
                type="search"
                name="storefront-search"
                data-testid="storefront-nav-search-input"
                aria-label="Tìm sản phẩm"
                placeholder="Tìm sản phẩm..."
                value={searchInput}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                className="w-full h-9 pl-9 pr-3 text-sm bg-muted rounded-full border border-transparent focus:outline-none focus:bg-background focus:border-primary/30 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-colors"
              />
            </form>
            {searchOpen && searchInput.trim().length >= 2 && (
              <div
                data-testid="storefront-nav-typeahead-dropdown"
                className="absolute left-0 right-0 top-full z-50 mt-2 flex max-h-[60vh] w-full flex-col overflow-hidden rounded-xl border bg-card shadow-lg sm:left-auto sm:w-[min(420px,calc(100vw-2rem))]"
              >
                <div className="min-h-0 overflow-y-auto scrollbar-thin">
                  {searchLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Đang tìm trên catalog backend...</div>}
                  {!searchLoading && searchHits.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Không tìm thấy sản phẩm công khai phù hợp.</div>
                  )}
                  {!searchLoading && searchHits.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      className={cn(
                        "block w-full px-3 py-2 text-left hover:bg-muted",
                        idx === activeSearchIdx && "bg-muted",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => goToSearchHit(p)}
                    >
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{p.code} · {p.categoryName}</span>
                      {renderMatchedVariant(p)}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
                  <span>
                    {searchLoading ? "Đang tìm..." : `${searchHits.length} kết quả`}
                    {!searchLoading && searchOverflowCount > 0 ? ` · ${searchHits.length}/${searchTotal} sản phẩm` : ""}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => submitSearch()}
                  >
                    ↑↓ chọn · <CornerDownLeft className="h-3 w-3" /> mở · xem tất cả
                  </button>
                </div>
              </div>
            )}
          </div>

          <Link
            to="/cart"
            className="relative order-2 ml-auto rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:order-4 sm:ml-0"
            aria-label={`Giỏ hàng (${cartCount} sản phẩm)`}
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-storefront-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          <div className="order-5 hidden items-center gap-2 xl:flex">
            {loggedIn ? (
              <>
                {(auth.isAdmin || auth.isStaff) && (
                  <Link
                    to={auth.isAdmin ? "/admin" : "/admin/pos"}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full border border-border hover:bg-muted whitespace-nowrap"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" /> {auth.isAdmin ? "Quản trị" : "POS"}
                  </Link>
                )}
                <Link
                  to="/account"
                  className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-full border border-border hover:bg-muted max-w-[150px]"
                  title={showName}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="truncate">{showName || "Tài khoản"}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full bg-muted hover:bg-muted/80 whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-foreground text-background hover:bg-primary transition-colors whitespace-nowrap"
              >
                Đăng nhập
              </Link>
            )}
          </div>

          <button
            type="button"
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            onClick={() => setMenuOpen(!menuOpen)}
            className="order-3 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted sm:order-6 xl:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t bg-card p-2 animate-fade-in xl:hidden">
            {mainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg",
                  isActive(item.path) ? "bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <Link
              to="/cart"
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg",
                isActive("/cart") ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              <ShoppingCart className="h-4 w-4" />
              Giỏ hàng
            </Link>
            {loggedIn ? (
              <>
                {(auth.isAdmin || auth.isStaff) && (
                  <Link to={auth.isAdmin ? "/admin" : "/admin/pos"} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-muted-foreground rounded-lg hover:bg-muted">
                    <LayoutDashboard className="h-4 w-4" /> {auth.isAdmin ? "Quản trị" : "POS"}
                  </Link>
                )}
                <Link to="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-muted-foreground rounded-lg hover:bg-muted">
                  <User className="h-4 w-4" /> Tài khoản
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-semibold text-danger rounded-lg hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleSignOut();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Đăng xuất
                </button>
              </>
            ) : (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-muted-foreground rounded-lg hover:bg-muted">
                Đăng nhập
              </Link>
            )}
          </div>
        )}
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-card border-t safe-area-pb">
        <div className="flex items-center justify-around h-14">
          {bottomNavItems.map((item) => (
            <Link
              key={`${item.path}-${item.label}`}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 relative",
                item.path === accountPath ? (accountTabActive ? "text-primary" : "text-muted-foreground") : isActive(item.path) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.badge && (
                <span className="absolute -top-0.5 right-1 h-4 w-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
