import { Link } from "react-router-dom";
import { Package, ShoppingCart, Heart } from "lucide-react";
import { formatVND } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { toast } from "sonner";
import type { products } from "@/lib/mock-data";
import { resolveProductImage } from "@/lib/product-image";
import { cartActions } from "@/lib/cart";

type Product = (typeof products)[number];

function getStockStatus(stock: number, minStock: number) {
  if (stock === 0) return "out-of-stock" as const;
  if (stock <= minStock) return "low-stock" as const;
  return "in-stock" as const;
}

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const dv = product.variants.find((v) => v.isDefault) || product.variants[0];
  const stockStatus = getStockStatus(dv.stock, dv.minStock);
  const hasMulti = product.variants.length > 1;
  const minPrice = Math.min(...product.variants.map((v) => v.sellPrice));
  const maxPrice = Math.max(...product.variants.map((v) => v.sellPrice));
  const discount = stockStatus === "in-stock" && dv.sellPrice > 20000 ? Math.floor(((maxPrice - minPrice) / maxPrice) * 100) : 0;
  const imageUrl = resolveProductImage(product, dv);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dv.stock === 0) {
      toast.error("Sản phẩm đã hết hàng");
      return;
    }
    cartActions.add({
      productId: product.id,
      variantId: dv.id,
      productCode: product.code,
      variantCode: dv.code,
      productName: product.name,
      variantName: dv.name,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      qty: 1,
      unitPrice: dv.sellPrice,
      stock: dv.stock,
    });
    toast.success(`Đã thêm ${product.name} vào giỏ`);
  };

  return (
    <Link
      to={`/products/${product.id}`}
      className="group relative flex flex-col bg-storefront-surface rounded-2xl border border-border/60 overflow-hidden sf-shadow hover:sf-shadow-hover hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-300"
    >
      {/* Image */}
      <div className="aspect-square bg-gradient-to-br from-muted/40 to-storefront-soft relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
            <Package className="h-12 w-12 text-muted-foreground/30" strokeWidth={1.25} />
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
          {stockStatus !== "in-stock" && <StatusBadge status={stockStatus} />}
          {hasMulti && discount > 0 && stockStatus === "in-stock" && (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md bg-storefront-accent text-white shadow-sm">
              -{discount}%
            </span>
          )}
        </div>

        {/* Wishlist (top-right) */}
        <button
          onClick={(e) => {
            e.preventDefault();
            toast.success("Đã thêm vào yêu thích");
          }}
          className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-card/90 backdrop-blur flex items-center justify-center text-muted-foreground hover:text-storefront-accent opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all"
          aria-label="Yêu thích"
        >
          <Heart className="h-3.5 w-3.5" />
        </button>

        {/* Quick add (bottom CTA bar) */}
        <button
          onClick={handleAdd}
          disabled={dv.stock === 0}
          className="absolute bottom-0 inset-x-0 h-9 bg-foreground text-background text-xs font-semibold flex items-center justify-center gap-1.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 disabled:opacity-50"
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Thêm vào giỏ
        </button>
      </div>

      {/* Body */}
      <div className={compact ? "p-3" : "p-3.5"}>
        <p className="sf-eyebrow text-[10px]">{product.categoryName}</p>
        <h3 className="font-semibold text-sm mt-1 line-clamp-2 leading-snug min-h-[2.5rem] group-hover:text-primary transition-colors">
          {product.name}
        </h3>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <p className="font-bold text-[15px] text-foreground leading-none">
              {hasMulti ? `Từ ${formatVND(minPrice)}` : formatVND(dv.sellPrice)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">/ {dv.sellUnit}</p>
          </div>
          {hasMulti && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {product.variants.length} loại
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
