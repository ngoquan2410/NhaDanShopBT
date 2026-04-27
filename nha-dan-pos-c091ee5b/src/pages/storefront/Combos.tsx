import { Link } from "react-router-dom";
import { useStore } from "@/lib/store";
import { formatVND } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Reveal } from "@/components/storefront/Reveal";
import { Gift, Package, ShoppingCart, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function StorefrontCombos() {
  const { combos } = useStore();
  const active = combos.filter((c) => c.active);

  if (active.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={Gift}
          title="Chưa có combo khuyến mãi"
          description="Các combo ưu đãi sẽ được cập nhật sớm."
          action={
            <Link
              to="/products"
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
            >
              Xem sản phẩm
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="bg-storefront-bg min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden sf-combo-bg border-b">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-storefront-accent/20 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-10 md:py-14">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-storefront-accent text-white text-[11px] font-semibold uppercase tracking-wider">
            <Sparkles className="h-3 w-3" /> Combo tiết kiệm
          </span>
          <h1 className="mt-3 text-2xl md:text-4xl font-bold tracking-tight">
            Combo gia đình — Mua nhiều, giá tốt hơn
          </h1>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl">
            {active.length} combo được tuyển chọn — đủ dùng cho cả tuần, tiết kiệm đến 25% so với
            mua lẻ từng sản phẩm.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {active.map((combo, i) => {
            const stockStatus =
              combo.derivedStock === 0
                ? "out-of-stock"
                : combo.derivedStock <= 5
                ? "low-stock"
                : "in-stock";
            return (
              <Reveal key={combo.id} delay={Math.min(i, 6) * 0.05} y={18}>
              <div
                className="group bg-storefront-surface rounded-2xl border overflow-hidden sf-shadow hover:sf-shadow-hover hover:-translate-y-0.5 transition-all duration-300 flex flex-col h-full"
              >
                <div className="aspect-[5/3] sf-combo-bg relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                    <Gift className="h-16 w-16 text-storefront-accent/40" strokeWidth={1.25} />
                  </div>
                  <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-storefront-accent text-white shadow-sm">
                    <Sparkles className="h-3 w-3" /> COMBO
                  </div>
                  {stockStatus !== "in-stock" && (
                    <div className="absolute top-2.5 right-2.5">
                      <StatusBadge status={stockStatus} />
                    </div>
                  )}
                  <span className="absolute bottom-2.5 right-2.5 text-[10px] font-mono bg-background/85 backdrop-blur px-2 py-0.5 rounded-full">
                    {combo.code}
                  </span>
                </div>

                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-base line-clamp-1">{combo.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {combo.components.length} sản phẩm · Còn {combo.derivedStock} combo
                  </p>

                  <ul className="mt-3 space-y-1.5 max-h-28 overflow-y-auto scrollbar-thin pr-1">
                    {combo.components.slice(0, 4).map((c, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Package className="h-3 w-3 shrink-0 text-primary/60" />
                        <span className="line-clamp-1 flex-1">
                          {c.productName}
                          {c.variantName ? ` · ${c.variantName}` : ""}
                        </span>
                        <span className="font-semibold text-foreground">×{c.quantity}</span>
                      </li>
                    ))}
                    {combo.components.length > 4 && (
                      <li className="text-xs text-muted-foreground italic">
                        +{combo.components.length - 4} sản phẩm khác
                      </li>
                    )}
                  </ul>

                  <div className="mt-auto pt-4 flex items-end justify-between border-t mt-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Giá combo
                      </p>
                      <p className="text-xl font-bold text-foreground">{formatVND(combo.price)}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (combo.derivedStock === 0) {
                          toast.error("Combo đã hết hàng");
                          return;
                        }
                        toast.success(`Đã thêm combo "${combo.name}" vào giỏ`);
                      }}
                      disabled={combo.derivedStock === 0}
                      className="inline-flex items-center gap-1.5 h-10 px-4 bg-foreground text-background rounded-full text-xs font-semibold hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed sf-shadow-cta"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Thêm
                    </button>
                  </div>
                </div>
              </div>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            Hoặc xem tất cả sản phẩm lẻ <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
