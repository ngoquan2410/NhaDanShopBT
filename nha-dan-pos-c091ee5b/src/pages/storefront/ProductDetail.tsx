import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatVND } from "@/lib/format";
import { QuantityStepper } from "@/components/shared/QuantityStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProductCard } from "@/components/storefront/ProductCard";
import {
  ChevronLeft,
  Package,
  ShoppingCart,
  Check,
  Heart,
  Share2,
  Truck,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { cartActions } from "@/lib/cart";
import { storefrontAvailabilityUi, storefrontVariantOutOfStock } from "@/lib/storefrontAvailability";
import { resolveProductImage } from "@/lib/product-image";
import { getPublicProduct, listPublicProductsPage, type StorefrontProduct } from "@/services/catalog/publicCatalog";

export default function StorefrontProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<StorefrontProduct | null | undefined>(undefined);
  const [relatedProducts, setRelatedProducts] = useState<StorefrontProduct[]>([]);
  const [variantId, setVariantId] = useState<string | undefined>();
  const [qty, setQty] = useState(1);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!id) return;
    setProduct(undefined);
    setRelatedProducts([]);
    void (async () => {
      try {
        const p = await getPublicProduct(id);
        if (!alive) return;
        setProduct(p);
        setVariantId(p?.variants.find((v) => v.isDefault)?.id ?? p?.variants[0]?.id);
        if (!p) return;
        try {
          const page = await listPublicProductsPage({ categoryId: p.categoryId, page: 0, size: 6, sort: "name,asc" });
          if (alive) setRelatedProducts(page.items);
        } catch {
          if (alive) setRelatedProducts([]);
        }
      } catch {
        if (alive) setProduct(null);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    setImageBroken(false);
  }, [id, variantId]);

  useEffect(() => {
    if (!product) return;
    const v = product.variants.find((x) => x.id === variantId) || product.variants[0];
    if (!v) return;
    const maxSel = storefrontVariantOutOfStock(v)
      ? 1
      : typeof v.availableQty === "number"
        ? Math.max(1, v.availableQty)
        : 20;
    setQty((q) => Math.min(q, maxSel));
  }, [product, variantId]);

  if (product === undefined) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-sm text-muted-foreground">Đang tải sản phẩm backend...</div>;
  }

  if (!product) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={Package}
          title="Không tìm thấy sản phẩm"
          description="Sản phẩm có thể đã bị gỡ hoặc đường dẫn không hợp lệ."
          action={
            <Link
              to="/products"
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
            >
              Quay lại danh sách
            </Link>
          }
        />
      </div>
    );
  }

  const variant = product.variants.find((v) => v.id === variantId) || product.variants[0];
  const imageUrl = resolveProductImage(product, variant);
  const availability = storefrontAvailabilityUi(variant);
  const outOfStock = storefrontVariantOutOfStock(variant);
  const qtyMax = outOfStock
    ? 1
    : typeof variant.availableQty === "number"
      ? Math.max(1, variant.availableQty)
      : 20;
  const related = relatedProducts
    .filter((p) => p.id !== product.id && p.categoryId === product.categoryId && p.active)
    .slice(0, 5);

  const addToCart = () => {
    if (outOfStock) {
      toast.error("Sản phẩm đã hết hàng");
      return;
    }
    cartActions.add({
      productId: product.id,
      variantId: variant.id,
      productCode: product.code,
      variantCode: variant.code,
      productName: product.name,
      variantName: variant.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      qty,
      unitPrice: variant.sellPrice,
      sellUnit: variant.sellUnit,
      availableQty: variant.availableQty,
      availabilityStatus: variant.availabilityStatus,
      catalogSource: "backend",
      schemaVersion: 2,
    });
    toast.success(`Đã thêm ${qty} ${variant.sellUnit} ${product.name} vào giỏ`);
  };

  const buyNow = () => {
    addToCart();
    navigate("/cart");
  };

  return (
    <div className="bg-storefront-bg min-h-screen pb-24 md:pb-10">
      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-5">
          <Link to="/" className="hover:text-foreground">Trang chủ</Link>
          <span>/</span>
          <Link to="/products" className="hover:text-foreground">Sản phẩm</Link>
          <span>/</span>
          <span className="text-foreground truncate">{product.name}</span>
        </nav>

        <button
          onClick={() => navigate(-1)}
          className="md:hidden inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại
        </button>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-12">
          {/* Image gallery */}
          <div className="space-y-3">
            <div className="aspect-square bg-storefront-surface rounded-3xl border flex items-center justify-center relative overflow-hidden sf-shadow">
              {imageUrl && !imageBroken ? (
                <img
                  src={imageUrl}
                  alt={product.name}
                  onError={() => setImageBroken(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <Package className="h-28 w-28 text-muted-foreground/25" strokeWidth={1.1} />
              )}
              <div className="absolute top-4 right-4 flex flex-col gap-2">
                <button
                  onClick={() => toast.success("Đã thêm vào yêu thích")}
                  className="h-10 w-10 rounded-full bg-card/95 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-storefront-accent shadow"
                  aria-label="Yêu thích"
                >
                  <Heart className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    toast.success("Đã sao chép liên kết");
                  }}
                  className="h-10 w-10 rounded-full bg-card/95 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-foreground shadow"
                  aria-label="Chia sẻ"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Thumbnail strip (placeholder) */}
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  className={cn(
                    "aspect-square rounded-xl bg-storefront-surface border flex items-center justify-center hover:border-primary/40 transition-colors",
                    i === 0 && "border-primary ring-2 ring-primary/20"
                  )}
                >
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <p className="sf-eyebrow">{product.categoryName}</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1.5 leading-tight">
              {product.name}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">Mã: {product.code}</span>
              <span>·</span>
              <span className="text-success font-medium">★ 4.8 (128 đánh giá)</span>
            </div>

            {/* Price */}
            <div className="mt-5 p-4 rounded-2xl bg-storefront-soft border border-border/60">
              <div className="flex items-baseline gap-2.5">
                <span className="text-3xl md:text-4xl font-bold text-foreground">
                  {formatVND(variant.sellPrice)}
                </span>
                <span className="text-sm text-muted-foreground">/ {variant.sellUnit}</span>
              </div>
              <div className="mt-1.5 flex flex-col gap-1 text-xs">
                <span className="inline-flex items-center gap-1 text-success font-medium">
                  <Check className="h-3.5 w-3.5" /> Sản phẩm đang mở bán
                </span>
                <span
                  data-testid="storefront-product-detail-availability"
                  className={cn("text-xs", availability.textClassName)}
                >
                  {availability.text}
                </span>
              </div>
            </div>

            {/* Variants */}
            {product.variants.length > 1 && (
              <div className="mt-5">
                <p className="text-sm font-semibold mb-2.5">
                  Phân loại: <span className="text-muted-foreground font-normal">{variant.name}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      className={cn(
                        "px-4 py-2.5 text-sm rounded-xl border-2 transition-all",
                        v.id === variant.id
                          ? "border-foreground bg-foreground text-background font-semibold"
                          : "border-border bg-storefront-surface hover:border-foreground/40"
                      )}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-5" data-testid="storefront-product-quantity-section">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2.5">
                <p className="text-sm font-semibold">Số lượng</p>
                <span className="text-sm text-muted-foreground">
                  Đang chọn:{" "}
                  <span className="font-semibold text-foreground tabular-nums" data-testid="storefront-product-quantity-value">
                    {qty}
                  </span>
                </span>
              </div>
              <div className={cn("flex items-center gap-3", outOfStock && "pointer-events-none opacity-45")}>
                <QuantityStepper
                  value={qty}
                  onChange={setQty}
                  min={1}
                  max={qtyMax}
                  decrementTestId="storefront-product-quantity-decrement"
                  incrementTestId="storefront-product-quantity-increment"
                />
              </div>
            </div>

            {/* Desktop CTAs */}
            <div className="mt-6 hidden md:grid grid-cols-2 gap-3">
              <button
                onClick={addToCart}
                data-testid="storefront-add-cart"
                disabled={outOfStock}
                className={cn(
                  "inline-flex items-center justify-center gap-2 h-12 border-2 rounded-full text-sm font-semibold transition-colors",
                  outOfStock
                    ? "border-muted text-muted-foreground cursor-not-allowed opacity-60"
                    : "border-foreground text-foreground hover:bg-foreground hover:text-background",
                )}
              >
                <ShoppingCart className="h-4 w-4" /> Thêm vào giỏ
              </button>
              <button
                onClick={buyNow}
                disabled={outOfStock}
                className={cn(
                  "inline-flex items-center justify-center gap-2 h-12 rounded-full text-sm font-semibold sf-shadow-cta",
                  outOfStock
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                    : "bg-storefront-accent text-white hover:opacity-90",
                )}
              >
                Mua ngay
              </button>
            </div>

            {/* Trust badges */}
            <div className="mt-6 grid grid-cols-3 gap-2 border-t pt-5">
              {[
                { icon: Truck, label: "Giao 2 giờ" },
                { icon: ShieldCheck, label: "Chính hãng" },
                { icon: RotateCcw, label: "Đổi trả 7 ngày" },
              ].map((t) => (
                <div key={t.label} className="flex flex-col items-center text-center gap-1.5">
                  <div className="h-9 w-9 rounded-full bg-primary-soft text-primary flex items-center justify-center">
                    <t.icon className="h-4 w-4" />
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground">{t.label}</p>
                </div>
              ))}
            </div>

            {/* Specs */}
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-xs border-t pt-5">
              <div>
                <p className="text-muted-foreground">Đơn vị bán</p>
                <p className="font-semibold text-foreground mt-0.5">{variant.sellUnit}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Mở bán theo</p>
                <p className="font-semibold text-foreground mt-0.5">{variant.name}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="mt-14">
            <div className="flex items-end justify-between mb-5">
              <div>
                <p className="sf-eyebrow">Có thể bạn quan tâm</p>
                <h2 className="sf-section-title mt-1">Sản phẩm cùng danh mục</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} compact />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 z-20 bg-card/95 backdrop-blur border-t p-3 flex gap-2">
        <button
          onClick={addToCart}
          data-testid="storefront-add-cart"
          disabled={outOfStock}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1.5 h-11 border-2 rounded-full text-sm font-semibold",
            outOfStock
              ? "border-muted text-muted-foreground cursor-not-allowed opacity-60"
              : "border-foreground text-foreground",
          )}
        >
          <ShoppingCart className="h-4 w-4" /> Thêm
        </button>
        <button
          onClick={buyNow}
          disabled={outOfStock}
          className={cn(
            "flex-1 inline-flex items-center justify-center h-11 rounded-full text-sm font-semibold",
            outOfStock ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60" : "bg-storefront-accent text-white",
          )}
        >
          Mua ngay
        </button>
      </div>
    </div>
  );
}
