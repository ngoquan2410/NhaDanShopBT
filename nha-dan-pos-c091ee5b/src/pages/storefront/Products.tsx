import { ProductCard } from "@/components/storefront/ProductCard";
import { Reveal } from "@/components/storefront/Reveal";
import { Package, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { listPublicCategories, listPublicProductsPage, type StorefrontCategory, type StorefrontProduct } from "@/services/catalog/publicCatalog";

type SortKey = "newest" | "price-asc" | "price-desc" | "name";

export default function StorefrontProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const qParam = (searchParams.get("q") ?? "").trim();
  const categoryIdFromUrl = searchParams.get("categoryId");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    () => (categoryIdFromUrl?.trim() ? categoryIdFromUrl.trim() : null),
  );
  const [searchInput, setSearchInput] = useState(qParam);
  const [sort, setSort] = useState<SortKey>("newest");
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [activeCategories, setActiveCategories] = useState<StorefrontCategory[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    setSearchInput(qParam);
    setPage(0);
  }, [qParam]);

  useEffect(() => {
    const cid = categoryIdFromUrl?.trim() ? categoryIdFromUrl.trim() : null;
    setSelectedCategory(cid);
    setPage(0);
  }, [categoryIdFromUrl]);

  useEffect(() => {
    let alive = true;
    listPublicCategories()
      .then((c) => {
        if (!alive) return;
        setActiveCategories(c);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Không tải được danh mục backend"));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    listPublicProductsPage({
      search: qParam || undefined,
      categoryId: selectedCategory,
      page,
      size: pageSize,
      sort: "name,asc",
    })
      .then((result) => {
        if (reqId !== reqIdRef.current) return;
        setProducts(result.items);
        setTotalElements(result.totalElements);
        setTotalPages(result.totalPages);
      })
      .catch((e) => {
        if (reqId !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "Không tải được catalog backend");
      })
      .finally(() => {
        if (reqId !== reqIdRef.current) return;
        setLoading(false);
      });
  }, [qParam, selectedCategory, page, pageSize]);

  const visibleProducts = useMemo(() => {
    let list = [...products];
    list = [...list].sort((a, b) => {
      const ap = Math.min(...a.variants.map((v) => v.sellPrice));
      const bp = Math.min(...b.variants.map((v) => v.sellPrice));
      if (sort === "price-asc") return ap - bp;
      if (sort === "price-desc") return bp - ap;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return list;
  }, [products, sort]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    const q = searchInput.trim();
    if (q) next.set("q", q);
    else next.delete("q");
    setPage(0);
    setSearchParams(next);
  };

  const clearSearch = () => {
    setSearchInput("");
    const next = new URLSearchParams(searchParams);
    next.delete("q");
    setPage(0);
    setSearchParams(next);
  };

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
            {totalElements} sản phẩm sẵn sàng giao
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading && <div className="mb-4 text-sm text-muted-foreground">Đang tải sản phẩm backend...</div>}
        {error && <div className="mb-4 text-sm text-danger">{error}</div>}
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
          <form onSubmit={submitSearch} className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm sản phẩm theo tên..."
              className="w-full h-11 pl-10 pr-10 text-sm bg-storefront-surface rounded-full border focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
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
            type="button"
            data-testid="storefront-products-category-all"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("categoryId");
              next.delete("categoryName");
              setPage(0);
              setSearchParams(next);
            }}
            className={cn("sf-chip", !selectedCategory && "sf-chip-active")}
          >
            Tất cả
          </button>
          {activeCategories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              data-testid={`storefront-products-category-${cat.id}`}
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("categoryId", cat.id);
                next.set("categoryName", cat.name);
                setPage(0);
                setSearchParams(next);
              }}
              className={cn("sf-chip", selectedCategory === cat.id && "sf-chip-active")}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grid */}
        {visibleProducts.length === 0 ? (
          <div className="text-center py-20 bg-storefront-surface rounded-2xl border">
            <Package className="h-14 w-14 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.25} />
            <p className="font-semibold">Không tìm thấy sản phẩm phù hợp</p>
            <p className="text-sm text-muted-foreground mt-1">Thử thay đổi bộ lọc hoặc từ khóa khác</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {visibleProducts.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 0.04} y={16}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page <= 0 || loading}
              className="px-3 py-2 rounded-full border text-sm disabled:opacity-50"
            >
              Trước
            </button>
            <span className="text-sm text-muted-foreground">
              Trang {page + 1}/{Math.max(totalPages, 1)}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="px-3 py-2 rounded-full border text-sm disabled:opacity-50"
            >
              Sau
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
