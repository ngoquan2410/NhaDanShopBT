import { products, categories } from "@/lib/mock-data";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Reveal } from "@/components/storefront/Reveal";
import { Package, Search, SlidersHorizontal, X } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "price-asc" | "price-desc" | "name";

export default function StorefrontProducts() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const activeCategories = categories.filter((c) => c.active);

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.active);
    if (selectedCategory) list = list.filter((p) => p.categoryId === selectedCategory);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    list = [...list].sort((a, b) => {
      const ap = Math.min(...a.variants.map((v) => v.sellPrice));
      const bp = Math.min(...b.variants.map((v) => v.sellPrice));
      if (sort === "price-asc") return ap - bp;
      if (sort === "price-desc") return bp - ap;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return list;
  }, [selectedCategory, search, sort]);

  return (
    <div className="bg-storefront-bg min-h-screen">
      {/* Page header */}
      <div className="bg-storefront-surface border-b">
        <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
          <p className="sf-eyebrow">Cửa hàng</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
            Tất cả sản phẩm
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} sản phẩm sẵn sàng giao
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm sản phẩm theo tên..."
              className="w-full h-11 pl-10 pr-10 text-sm bg-storefront-surface rounded-full border focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-11 px-3 text-sm bg-storefront-surface rounded-full border focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="newest">Mới nhất</option>
              <option value="price-asc">Giá thấp → cao</option>
              <option value="price-desc">Giá cao → thấp</option>
              <option value="name">Tên A → Z</option>
            </select>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-2.5 overflow-x-auto pb-3 mb-5 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn("sf-chip", !selectedCategory && "sf-chip-active")}
          >
            Tất cả
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn("sf-chip", selectedCategory === cat.id && "sf-chip-active")}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-storefront-surface rounded-2xl border">
            <Package className="h-14 w-14 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.25} />
            <p className="font-semibold">Không tìm thấy sản phẩm</p>
            <p className="text-sm text-muted-foreground mt-1">Thử thay đổi bộ lọc hoặc từ khóa khác</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {filtered.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 0.04} y={16}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
