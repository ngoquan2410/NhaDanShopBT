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
import { products, combos, categories } from "@/lib/mock-data";
import { ProductCard } from "@/components/storefront/ProductCard";
import { ComboCard } from "@/components/storefront/ComboCard";
import { HotProductsCarousel } from "@/components/storefront/HotProductsCarousel";
import { HeroSlider } from "@/components/storefront/HeroSlider";
import { Reveal } from "@/components/storefront/Reveal";
import { cn } from "@/lib/utils";
import { useState } from "react";

const trustItems = [
  { icon: Truck, label: "Giao nhanh trong ngày", sub: "Nội thành 2 giờ" },
  { icon: ShieldCheck, label: "Hàng chính hãng", sub: "Bảo đảm nguồn gốc" },
  { icon: RotateCcw, label: "Đổi trả 7 ngày", sub: "Miễn phí kiểm tra" },
  { icon: Headphones, label: "Hỗ trợ 24/7", sub: "Hotline 1900 1234" },
];

export default function StorefrontHome() {
  const activeCategories = categories.filter((c) => c.active);
  const activeProducts = products.filter((p) => p.active);
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const filteredProducts = activeChip
    ? activeProducts.filter((p) => p.categoryId === activeChip)
    : activeProducts;

  return (
    <div className="storefront-relaxed bg-storefront-bg">
      {/* === HERO SLIDER === */}
      <HeroSlider items={activeProducts.slice(0, 5)} />

      {/* === Trust strip === */}
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
                onClick={() => setActiveChip(null)}
                className={cn("sf-chip", !activeChip && "sf-chip-active")}
              >
                Tất cả
              </button>
              {activeCategories.map((cat) => (
                <button
                  key={cat.id}
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
            <HotProductsCarousel items={filteredProducts.slice(0, 10)} />
          </section>
        </Reveal>

        {/* === Combo banner === */}
        <Reveal>
          <section className="relative overflow-hidden rounded-3xl sf-combo-bg p-6 md:p-10 border">
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
                  Các combo gia đình được thiết kế sẵn — đủ dùng trong tuần, giá ưu đãi hơn mua lẻ.
                </p>
                <Link
                  to="/combos"
                  className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 sf-shadow-cta"
                >
                  Xem tất cả combo <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {combos.filter((c) => c.active).slice(0, 2).map((c) => (
                  <ComboCard key={c.id} combo={c} />
                ))}
              </div>
            </div>
          </section>
        </Reveal>

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
              {filteredProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}
