import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Package, ShoppingBag, Sparkles } from "lucide-react";
import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { products as ProductList } from "@/lib/mock-data";

type Product = (typeof ProductList)[number];

const BADGES = [
  { label: "Top #1 · Chủ đạo", cls: "bg-storefront-gold text-white" },
  { label: "Top #2 · Bán chạy", cls: "bg-storefront-accent text-white" },
  { label: "Top #3 · Bán chạy", cls: "bg-info text-info-foreground" },
  { label: "Top #4 · Giá tốt", cls: "bg-success text-success-foreground" },
  { label: "Top #5 · Mới", cls: "bg-primary text-primary-foreground" },
];

const TAGLINES = [
  "Sản phẩm chủ đạo — luôn sẵn kho, giao nhanh trong ngày.",
  "Lựa chọn của hàng ngàn gia đình Việt mỗi tuần.",
  "Chất lượng tuyển chọn, giá niêm yết minh bạch.",
  "Hàng chính hãng, đóng gói cẩn thận, vận chuyển an toàn.",
  "Mới về — số lượng có hạn, đặt sớm để không lỡ.",
];

const ACCENTS = [
  "from-storefront-gold/40 via-storefront-accent/15 to-transparent",
  "from-storefront-accent/40 via-primary/15 to-transparent",
  "from-info/40 via-primary/15 to-transparent",
  "from-success/40 via-storefront-gold/15 to-transparent",
  "from-primary/40 via-storefront-accent/15 to-transparent",
];

export function HeroSlider({ items }: { items: Product[] }) {
  const slides = items.slice(0, 5);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    containScroll: false,
    duration: 32,
    skipSnaps: false,
  });
  const [selected, setSelected] = useState(0);
  const [isHover, setIsHover] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    const id = window.setInterval(() => {
      if (document.hidden || isHover) return;
      emblaApi.scrollNext();
    }, 5500);
    return () => window.clearInterval(id);
  }, [emblaApi, isHover]);

  if (!slides.length) return null;

  const total = slides.length;
  // Distance from active slide accounting for loop wrap
  const distanceFrom = (idx: number) => {
    const raw = Math.abs(idx - selected);
    return Math.min(raw, total - raw);
  };

  return (
    <section
      className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top,hsl(220_45%_14%),hsl(225_40%_8%)_60%,hsl(230_45%_5%)_100%)] py-12 md:py-20"
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      {/* Ambient glows */}
      <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-storefront-accent/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-storefront-gold/10 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none [background-image:linear-gradient(hsl(0_0%_100%)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%)_1px,transparent_1px)] [background-size:48px_48px]" />

      {/* Header eyebrow */}
      <div className="relative max-w-7xl mx-auto px-4 mb-8 md:mb-12 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/15 text-storefront-hero-foreground/90 text-[11px] font-semibold uppercase tracking-[0.2em]">
          <Sparkles className="h-3 w-3" /> Spotlight
        </span>
        <h2 className="mt-3 text-2xl md:text-4xl font-bold tracking-tight text-storefront-hero-foreground">
          Top 5 sản phẩm chủ đạo
        </h2>
      </div>

      {/* Stage */}
      <div className="relative">
        <div ref={emblaRef} className="overflow-hidden px-2 md:px-0">
          <div className="flex items-center">
            {slides.map((p, idx) => {
              const dv = p.variants.find((v) => v.isDefault) || p.variants[0];
              const hasMulti = p.variants.length > 1;
              const minPrice = Math.min(...p.variants.map((v) => v.sellPrice));
              const price = hasMulti ? `Từ ${formatVND(minPrice)}` : formatVND(dv.sellPrice);
              const badge = BADGES[idx % BADGES.length];
              const tagline = TAGLINES[idx % TAGLINES.length];
              const accent = ACCENTS[idx % ACCENTS.length];

              const dist = distanceFrom(idx);
              const isActive = dist === 0;
              const isNeighbor = dist === 1;

              return (
                <div
                  key={p.id}
                  className="shrink-0 grow-0 basis-[78%] sm:basis-[58%] md:basis-[44%] lg:basis-[40%] xl:basis-[36%] px-2 md:px-3"
                  onClick={() => !isActive && emblaApi?.scrollTo(idx)}
                >
                  <div
                    className={cn(
                      "relative rounded-[2rem] border overflow-hidden transition-all duration-700 ease-out origin-center",
                      "bg-gradient-to-br backdrop-blur-md",
                      accent,
                      isActive && "scale-100 opacity-100 border-white/30 shadow-[0_40px_100px_-20px_hsl(0_0%_0%/0.75)] z-20",
                      isNeighbor && "scale-[0.78] opacity-55 border-white/10 z-10 cursor-pointer hover:opacity-75",
                      !isActive && !isNeighbor && "scale-[0.62] opacity-25 border-white/5 cursor-pointer"
                    )}
                  >
                    {/* Dark overlay for non-active to push them back */}
                    <div
                      className={cn(
                        "absolute inset-0 transition-opacity duration-700 pointer-events-none z-[1]",
                        isActive ? "bg-[hsl(225_40%_10%/0.45)]" : "bg-[hsl(225_50%_5%/0.7)]"
                      )}
                    />

                    {/* Card content */}
                    <div className="relative z-[2] p-6 md:p-8 min-h-[440px] md:min-h-[500px] flex flex-col">
                      {/* Image area — dominant */}
                      <div className="relative">
                        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-white/95">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(var(--storefront-soft)),transparent_60%)]" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Package className="h-24 w-24 md:h-28 md:w-28 text-foreground/15" strokeWidth={1.1} />
                          </div>
                        </div>
                        <div className={cn("absolute -top-2 -left-2 px-2.5 py-1 rounded-full text-[10px] md:text-[11px] font-bold shadow-lg", badge.cls)}>
                          {badge.label}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="mt-5 md:mt-6 text-storefront-hero-foreground flex-1 flex flex-col">
                        <p className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] opacity-70 font-semibold">
                          {p.categoryName}
                        </p>
                        <h3 className={cn(
                          "mt-1.5 font-bold tracking-tight leading-[1.15]",
                          isActive ? "text-xl md:text-2xl lg:text-3xl" : "text-lg md:text-xl line-clamp-2"
                        )}>
                          {p.name}
                        </h3>

                        {isActive && (
                          <p className="mt-2 text-sm opacity-85 leading-relaxed line-clamp-2 animate-fade-in">
                            {tagline}
                          </p>
                        )}

                        <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-60">Giá bán</p>
                            <p className={cn("font-bold", isActive ? "text-xl md:text-2xl" : "text-lg")}>{price}</p>
                            <p className="text-[10px] opacity-60 mt-0.5">/ {dv.sellUnit}</p>
                          </div>
                          {isActive && (
                            <div className="flex flex-col gap-2 animate-fade-in">
                              <Link
                                to={`/products/${p.id}`}
                                className="inline-flex items-center justify-center gap-1.5 bg-white text-foreground px-4 py-2.5 rounded-full text-xs md:text-sm font-semibold hover:bg-white/90 transition-colors shadow-lg whitespace-nowrap"
                              >
                                <ShoppingBag className="h-3.5 w-3.5" /> Mua ngay
                              </Link>
                              <Link
                                to={`/products/${p.id}`}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border border-white/30 text-storefront-hero-foreground hover:bg-white/10 transition-colors whitespace-nowrap"
                              >
                                Chi tiết <ArrowRight className="h-3 w-3" />
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Active progress bar */}
                    {isActive && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-[3]">
                        <div
                          key={`${idx}-${isHover}`}
                          className={cn(
                            "h-full bg-white/80",
                            !isHover ? "animate-[hero-progress_5500ms_linear_forwards]" : "w-0"
                          )}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Arrows */}
        <button
          onClick={() => emblaApi?.scrollPrev()}
          aria-label="Slide trước"
          className="hidden md:flex absolute left-6 lg:left-12 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 backdrop-blur border border-white/20 text-storefront-hero-foreground items-center justify-center hover:bg-white/20 hover:border-white/40 transition-all z-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => emblaApi?.scrollNext()}
          aria-label="Slide sau"
          className="hidden md:flex absolute right-6 lg:right-12 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 backdrop-blur border border-white/20 text-storefront-hero-foreground items-center justify-center hover:bg-white/20 hover:border-white/40 transition-all z-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Pagination */}
      <div className="relative mt-10 flex items-center justify-center gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={`Đi tới slide ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === selected ? "w-10 bg-white" : "w-2 bg-white/30 hover:bg-white/60"
            )}
          />
        ))}
      </div>
    </section>
  );
}
