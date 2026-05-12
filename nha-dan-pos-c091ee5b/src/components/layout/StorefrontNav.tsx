import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Search, ShoppingCart, User, Layers, Menu, X, Store, LogOut, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/admin-auth";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { listPublicProductsPage, type StorefrontProduct } from "@/services/catalog/publicCatalog";

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

export function StorefrontNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHits, setSearchHits] = useState<StorefrontProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
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
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    listPublicProductsPage({ search: term, page: 0, size: 8, sort: "name,asc" })
      .then((page) => {
        if (reqId !== searchReqIdRef.current) return;
        setSearchHits(page.items);
      })
      .catch(() => {
        if (reqId !== searchReqIdRef.current) return;
        setSearchHits([]);
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

  const renderMatchedVariant = (product: StorefrontProduct) => {
    const q = searchInput.trim().toLowerCase();
    const match = q
      ? product.variants.find((v) => v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
      : undefined;
    if (!match) return null;
    return <span className="block truncate text-[11px] text-muted-foreground">Phân loại: {match.name || "Mặc định"} · {match.code}</span>;
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-hover text-primary-foreground flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <Store className="h-5 w-5" />
            </div>
            <span className="font-bold text-base tracking-tight hidden sm:inline">Nhã Đan Shop</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 ml-2">
            {mainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-semibold rounded-full transition-colors",
                  isActive(item.path)
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          <div ref={searchBoxRef} className="hidden sm:block max-w-xs flex-1 relative">
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
                className="w-full h-9 pl-9 pr-3 text-sm bg-muted rounded-full border border-transparent focus:outline-none focus:bg-background focus:border-primary/30 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground transition-colors"
              />
            </form>
            {searchOpen && searchInput.trim().length >= 2 && (
              <div
                data-testid="storefront-nav-typeahead-dropdown"
                className="absolute right-0 top-full z-50 mt-2 w-[min(420px,90vw)] overflow-hidden rounded-xl border bg-card shadow-lg"
              >
                {searchLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Đang tìm trên catalog backend…</div>}
                {!searchLoading && searchHits.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Không tìm thấy sản phẩm công khai phù hợp.</div>
                )}
                {!searchLoading && searchHits.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSearchOpen(false);
                      navigate(`/products/${p.id}`);
                    }}
                  >
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{p.code} · {p.categoryName}</span>
                    {renderMatchedVariant(p)}
                  </button>
                ))}
                <button
                  type="button"
                  className="block w-full border-t px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submitSearch()}
                >
                  Nhấn Enter hoặc bấm để xem tất cả kết quả cho “{searchInput.trim()}”
                </button>
              </div>
            )}
          </div>

          <Link
            to="/cart"
            className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
            aria-label={`Giỏ hàng (${cartCount} sản phẩm)`}
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-storefront-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          <div className="hidden md:flex items-center gap-2">
            {loggedIn ? (
              <>
                {(auth.isAdmin || auth.isStaff) && (
                  <Link
                    to={auth.isAdmin ? "/admin" : "/admin/pos"}
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full border border-border hover:bg-muted"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" /> {auth.isAdmin ? "Quản trị" : "POS"}
                  </Link>
                )}
                <Link
                  to="/account"
                  className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-2 rounded-full border border-border hover:bg-muted max-w-[160px]"
                  title={showName}
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="truncate">{showName || "Tài khoản"}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-full bg-muted hover:bg-muted/80"
                >
                  <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-foreground text-background hover:bg-primary transition-colors"
              >
                Đăng nhập
              </Link>
            )}
          </div>

          <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-1.5 text-muted-foreground hover:text-foreground">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t bg-card p-2 animate-fade-in">
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
                  <Link to={auth.isAdmin ? "/admin" : "/admin/pos"} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
                    <LayoutDashboard className="h-4 w-4" /> {auth.isAdmin ? "Quản trị" : "POS"}
                  </Link>
                )}
                <Link to="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
                  <User className="h-4 w-4" /> Tài khoản
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-semibold text-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleSignOut();
                  }}
                >
                  <LogOut className="h-4 w-4" /> Đăng xuất
                </button>
              </>
            ) : (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-muted-foreground">
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
