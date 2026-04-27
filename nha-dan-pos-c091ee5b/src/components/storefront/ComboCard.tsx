import { Link } from "react-router-dom";
import { Gift, ShoppingCart, Sparkles } from "lucide-react";
import { formatVND } from "@/lib/format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { toast } from "sonner";
import type { combos } from "@/lib/mock-data";

type Combo = (typeof combos)[number];

export function ComboCard({ combo }: { combo: Combo }) {
  const stockStatus =
    combo.derivedStock === 0 ? "out-of-stock" : combo.derivedStock <= 5 ? "low-stock" : "in-stock";

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (combo.derivedStock === 0) {
      toast.error("Combo đã hết hàng");
      return;
    }
    toast.success(`Đã thêm combo "${combo.name}" vào giỏ`);
  };

  return (
    <Link
      to={`/combos`}
      className="group relative flex flex-col rounded-2xl border border-border/60 overflow-hidden sf-shadow hover:sf-shadow-hover hover:-translate-y-0.5 transition-all duration-300 bg-storefront-surface"
    >
      <div className="aspect-[5/3] sf-combo-bg relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <Gift className="h-14 w-14 text-storefront-accent/40" strokeWidth={1.25} />
        </div>
        <div className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md bg-storefront-accent text-white shadow-sm">
          <Sparkles className="h-3 w-3" /> COMBO
        </div>
        {stockStatus !== "in-stock" && (
          <div className="absolute top-2.5 right-2.5">
            <StatusBadge status={stockStatus} />
          </div>
        )}
      </div>
      <div className="p-3.5 flex flex-col gap-2">
        <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
          {combo.name}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {combo.components.length} sản phẩm · Còn {combo.derivedStock} combo
        </p>
        <div className="flex items-center justify-between mt-1">
          <p className="font-bold text-base text-foreground">{formatVND(combo.price)}</p>
          <button
            onClick={handleAdd}
            disabled={combo.derivedStock === 0}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-foreground text-background hover:bg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Thêm vào giỏ"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Link>
  );
}
