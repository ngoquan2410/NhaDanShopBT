import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "./ProductCard";
import type { products as ProductList } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type Product = (typeof ProductList)[number];

export function HotProductsCarousel({ items }: { items: Product[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    slidesToScroll: 1,
    containScroll: "trimSnaps",
    duration: 28,
    dragFree: false,
    skipSnaps: false,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [isHover, setIsHover] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    setSnaps(emblaApi.scrollSnapList());
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", () => {
      onSelect();
      setSnaps(emblaApi.scrollSnapList());
    });
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    const id = window.setInterval(() => {
      if (document.hidden || isHover) return;
      emblaApi.scrollNext();
    }, 4500);
    return () => window.clearInterval(id);
  }, [emblaApi, isHover]);

  if (!items.length) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      <div ref={emblaRef} className="overflow-hidden -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex -ml-3 md:-ml-4">
          {items.map((p) => (
            <div
              key={p.id}
              className="pl-3 md:pl-4 shrink-0 grow-0 basis-[78%] xs:basis-[72%] sm:basis-1/3 lg:basis-1/4 xl:basis-1/5"
            >
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <button
        onClick={() => emblaApi?.scrollPrev()}
        disabled={!canPrev}
        aria-label="Trước"
        className={cn(
          "hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-card border shadow-md items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={() => emblaApi?.scrollNext()}
        disabled={!canNext}
        aria-label="Sau"
        className={cn(
          "hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-card border shadow-md items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Pagination dots */}
      {snaps.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {snaps.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Đi tới ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === selected ? "w-6 bg-storefront-accent" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
