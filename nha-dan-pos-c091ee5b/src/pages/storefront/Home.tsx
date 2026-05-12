import { Link } from "react-router-dom";
import {
  ChevronRight,
  Flame,
  Sparkles,
  Truck,
  ShieldCheck,
  RotateCcw,
  Headphones,
  ArrowRight,
} from "lucide-react";
import { ProductCard } from "@/components/storefront/ProductCard";
import { HotProductsCarousel } from "@/components/storefront/HotProductsCarousel";
import { HeroSlider } from "@/components/storefront/HeroSlider";
import { Reveal } from "@/components/storefront/Reveal";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import {
  listActiveCombosPublic,
  listPublicCategories,
  listPublicProductsPage,
  type StorefrontCategory,
  type StorefrontComboSummary,
  type StorefrontProduct,
} from "@/services/catalog/publicCatalog";
import { ComboCard } from "@/components/storefront/ComboCard";

const trustItems = [
  { icon: Truck, label: "Giao nhanh trong ngày", sub: "Nội thành 2 giờ" },
  { icon: ShieldCheck, label: "Hàng chính hãng", sub: "Bảo đảm nguồn gốc" },
  { icon: RotateCcw, label: "Đổi trả 7 ngày", sub: "Miễn phí kiểm tra" },
  { icon: Headphones, label: "Hỗ trợ 24/7", sub: "Hotline 1900 1234" },
];

const HOME_CATALOG_PAGE_SIZE = 48;

export default function StorefrontHome() {
  const [activeCategories, setActiveCategories] = useState<StorefrontCategory[]>([]);
  const [activeProducts, setActiveProducts] = useState<StorefrontProduct[]>([]);
  const [categoryProducts, setCategoryProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [activeCombos, setActiveCombos] = useState<StorefrontComboSummary[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listPublicProductsPage({ page: 0, size: HOME_CATALOG_PAGE_SIZE, sort: "name,asc" }),
      listPublicCategories(),
    ])
      .then(([page, categories]) => {
        if (!alive) return;
        setActiveProducts(page.items);
        setActiveCategories(categories);
        setError(null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Không tải được catalog"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!activeChip) {
      setCategoryProducts([]);
      setCategoryLoading(false);
      return;
    }
    let alive = true;
    setCategoryLoading(true);
    setError(null);
    listPublicProductsPage({
      categoryId: activeChip,
      page: 0,
      size: HOME_CATALOG_PAGE_SIZE,
      sort: "name,asc",
    })
      .then((page) => {
        if (!alive) return;
        setCategoryProducts(page.items);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Không tải được danh mục"))
      .finally(() => alive && setCategoryLoading(false));
    return () => { alive = false; };
  }, [activeChip]);

  useEffect(() => {
    let alive = true;
    listActiveCombosPublic().then((rows) => {
      if (!alive) return;
      setActiveCombos(rows.filter((c) => c.active));
    });
    return () => { alive = false; };
  }, []);

  const sectionProducts = activeChip ? categoryProducts : activeProducts;
  const showcaseCombos = activeCombos.filter((c) => c.active);

  return (
    <div className="storefront-relaxed bg-storefront-bg">
      {/* === HERO SLIDER === */}
      <HeroSlider items={activeProducts.slice(0, 5)} />

      {/* === Trust strip === */}
      {loading && <div className="max-w-7xl mx-auto px-4 py-3 text-sm text-muted-foreground">Đang tải catalog backend...</div>}
      {categoryLoading && activeChip && (
        <div className="max-w-7xl mx-auto px-4 py-2 text-sm text-muted-foreground">Đang tải sản phẩm theo danh mục từ máy chủ…</div>
      )}
      {error && <div className="max-w-7xl mx-auto px-4 py-3 text-sm text-danger">{error}</div>}

      <section className="border-y bg-storefront-surface">
        <div className="max-w-7xl mx-auto px-4 py-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {trustItems.map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary-soft text-primary flex items-center justify-center shrink-0">
                <t.icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{t.label}</p>
                <p className="text-[11px] text-muted-foreground">{t.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-12">
        {/* === Categories === */}
        <Reveal>
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="sf-eyebrow">Khám phá</p>
                <h2 className="sf-section-title mt-1">Danh mục sản phẩm</h2>
              </div>
              <Link to="/products" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
                Xem tất cả <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
              <button
                type="button"
                data-testid="storefront-home-category-all"
                onClick={() => setActiveChip(null)}
                className={cn("sf-chip", !activeChip && "sf-chip-active")}
              >
                Tất cả
              </button>
              {activeCategories.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  data-testid={`storefront-home-category-${cat.id}`}
                  onClick={() => setActiveChip(cat.id)}
                  className={cn("sf-chip", activeChip === cat.id && "sf-chip-active")}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </section>
        </Reveal>

        {/* === Hot selling (carousel) === */}
        <Reveal>
          <section>
            <div className="flex items-end justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-storefront-accent/10 text-storefront-accent flex items-center justify-center">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <p className="sf-eyebrow">Đang hot</p>
                  <h2 className="sf-section-title">Bán chạy nhất</h2>
                </div>
              </div>
              <Link to="/products" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
                Xem tất cả <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <HotProductsCarousel items={sectionProducts.slice(0, 10)} />
          </section>
        </Reveal>

        {/* === Combo (chỉ khi GET /api/combos/active có dữ liệu thật) === */}
        {showcaseCombos.length > 0 && (
          <Reveal>
            <section
              className="relative overflow-hidden rounded-3xl sf-combo-bg p-6 md:p-10 border"
              data-testid="storefront-home-combo-section"
            >
              <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-storefront-accent/20 blur-3xl" />
              <div className="relative grid md:grid-cols-2 gap-6 items-center">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-storefront-accent text-white text-[11px] font-semibold uppercase tracking-wider">
                    <Sparkles className="h-3 w-3" /> Combo tiết kiệm
                  </span>
                  <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">
                    Mua combo, tiết kiệm đến 25%
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground max-w-md">
                    Combo từ kho backend — giá và thành phần khớp trang Combo.
                  </p>
                  <Link
                    to="/combos"
                    className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 sf-shadow-cta"
                  >
                    Xem tất cả combo <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {showcaseCombos.slice(0, 2).map((c) => (
                    <ComboCard key={c.id} combo={c} />
                  ))}
                </div>
              </div>
            </section>
          </Reveal>
        )}

        {/* === All products === */}
        <Reveal>
          <section>
            <div className="flex items-end justify-between mb-5">
              <div>
                <p className="sf-eyebrow">Tất cả sản phẩm</p>
                <h2 className="sf-section-title mt-1">Mới nhất tại Nhã Đan Shop</h2>
              </div>
              <Link to="/products" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
                Xem tất cả <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {sectionProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
