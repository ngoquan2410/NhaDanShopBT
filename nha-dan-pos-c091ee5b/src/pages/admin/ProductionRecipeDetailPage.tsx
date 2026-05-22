import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { production } from "@/services";
import { products as productService } from "@/services";
import type { Product } from "@/lib/mock-data";
import type { ProductionRecipeDto } from "@/services/production/ProductionAdminService";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Pencil, Package, ListOrdered } from "lucide-react";

/** Read-only view chi tiết một quy trình sản xuất. Không thay đổi data flow. */
export default function ProductionRecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const errToastAt = useRef(0);
  const [loading, setLoading] = useState(true);
  const [recipe, setRecipe] = useState<ProductionRecipeDto | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    void (async () => {
      if (!id) return;
      setLoading(true);
      try {
        const [r, pg] = await Promise.all([
          production.getRecipe(Number(id)),
          productService.list({ pageSize: 500 }),
        ]);
        setRecipe(r);
        setProducts(pg.items);
      } catch (e) {
        const now = Date.now();
        if (now - errToastAt.current > 4000) {
          errToastAt.current = now;
          toast.error(e instanceof Error ? e.message : "Không tải quy trình");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(String(p.id), p);
    return m;
  }, [products]);

  const resolveProduct = (pid: number) => productMap.get(String(pid)) ?? null;
  const resolveVariant = (pid: number, vid: number) =>
      resolveProduct(pid)?.variants.find((v) => Number(v.id) === vid) ?? null;

  const outProd = recipe ? resolveProduct(recipe.outputProductId) : null;
  const outVar = recipe ? resolveVariant(recipe.outputProductId, recipe.outputVariantId) : null;

  return (
      <div className="admin-dense space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/admin/production" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Sản xuất
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Chi tiết quy trình</span>
        </div>

        {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
            </div>
        ) : !recipe ? (
            <div className="bg-card rounded-lg border p-6 text-sm text-muted-foreground">
              Không tìm thấy quy trình.
            </div>
        ) : (
            <>
              <PageHeader
                  title={recipe.name}
                  description={
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border">
                  {recipe.recipeCode}
                </span>
                      <span
                          className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border",
                              recipe.archived
                                  ? "bg-muted text-muted-foreground border-border"
                                  : recipe.active
                                      ? "bg-success-soft text-success border-success/20"
                                      : "bg-muted text-muted-foreground border-border",
                          )}
                      >
                  {recipe.archived ? "Đã archive" : recipe.active ? "Đang hoạt động" : "Tạm dừng"}
                </span>
                      <span
                          className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border",
                              recipe.outputMustBeSellable
                                  ? "bg-success-soft text-success border-success/20"
                                  : "bg-muted text-muted-foreground border-border",
                          )}
                      >
                  {recipe.outputMustBeSellable ? "Bán ở POS" : "Nội bộ"}
                </span>
                    </div>
                  }
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                          type="button"
                          onClick={() => navigate("/admin/production")}
                          className="inline-flex items-center px-3 h-9 text-sm font-medium border rounded-md hover:bg-muted transition-colors"
                      >
                        Quay lại
                      </button>
                      <button
                          type="button"
                          onClick={() => navigate(`/admin/production/recipes/${recipe.id}/edit`)}
                          className="inline-flex items-center gap-1.5 px-3 h-9 text-sm font-medium border rounded-md hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Sửa
                      </button>
                    </div>
                  }
              />

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="bg-card rounded-lg border p-4 lg:col-span-2">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Package className="h-4 w-4 text-primary" /> Thành phẩm output
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Sản phẩm</dt>
                      <dd className="mt-0.5 font-medium">
                        {outProd ? (
                            <>
                              <span className="font-mono text-xs text-muted-foreground mr-1">{outProd.code}</span>
                              {outProd.name}
                            </>
                        ) : (
                            <span className="font-mono">#{recipe.outputProductId}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Phân loại</dt>
                      <dd className="mt-0.5 font-medium">
                        {outVar ? (
                            <>
                              <span className="font-mono text-xs text-muted-foreground mr-1">{outVar.code}</span>
                              {outVar.name}
                            </>
                        ) : (
                            <span className="font-mono">#{recipe.outputVariantId}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">SL chuẩn / recipe</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{recipe.outputQty}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Chi phí sản xuất bổ sung</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{String(recipe.overheadCost)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-card rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <ListOrdered className="h-4 w-4 text-primary" /> Tổng quan
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-xs text-muted-foreground">Số dòng nguyên liệu</dt>
                      <dd className="font-medium tabular-nums">{recipe.components.length}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-xs text-muted-foreground">Cập nhật</dt>
                      <dd className="font-medium text-xs">
                        {recipe.updatedAtIso ? new Date(recipe.updatedAtIso).toLocaleString() : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="bg-card rounded-lg border overflow-hidden">
                <div className="p-4 border-b">
                  <p className="text-sm font-semibold">Nguyên liệu (BOM)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hệ số tiêu hao trên mỗi đơn vị output.
                  </p>
                </div>
                {/* Mobile cards */}
                <ul className="md:hidden divide-y">
                  {recipe.components.map((c, idx) => {
                    const p = resolveProduct(c.productId);
                    const v = resolveVariant(c.productId, c.variantId);
                    return (
                        <li key={`m-${idx}`} className="px-3 py-2.5 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">{p?.name ?? `SP #${c.productId}`}</p>
                              <p className="font-mono text-[11px] text-muted-foreground truncate">
                                {(p?.code ? `${p.code} · ` : "")}{v?.name ?? v?.code ?? `variant #${c.variantId}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-semibold tabular-nums">{c.qtyPerOutput}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">{c.unit}</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                            <div>
                              <span className="block text-[10px] text-muted-foreground">Tồn SX</span>
                              <span className="tabular-nums">{c.availableQty != null ? c.availableQty : "—"}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-muted-foreground">HSD lô gần</span>
                              <span>{c.nearestExpiryDateIso ? new Date(c.nearestExpiryDateIso).toLocaleDateString("vi-VN") : "—"}</span>
                            </div>
                          </div>
                        </li>
                    );
                  })}
                </ul>
                {/* Desktop / tablet table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-10">#</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Sản phẩm</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Phân loại</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-[120px]">SL / output</th>
                      <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-[80px]">Đ.vị</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-[88px]">Tồn SX</th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-[140px]">HSD lô gần</th>
                    </tr>
                    </thead>
                    <tbody>
                    {recipe.components.map((c, idx) => {
                      const p = resolveProduct(c.productId);
                      const v = resolveVariant(c.productId, c.variantId);
                      return (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 text-muted-foreground text-xs tabular-nums">{idx + 1}</td>
                            <td className="px-3 py-2.5">
                              {p ? (
                                  <>
                                    <span className="font-mono text-xs text-muted-foreground mr-1">{p.code}</span>
                                    {p.name}
                                  </>
                              ) : (
                                  <span className="font-mono text-xs">#{c.productId}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {v ? (
                                  <>
                                    <span className="font-mono text-xs text-muted-foreground mr-1">{v.code}</span>
                                    {v.name}
                                  </>
                              ) : (
                                  <span className="font-mono text-xs">#{c.variantId}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">{c.qtyPerOutput}</td>
                            <td className="px-3 py-2.5 text-center font-mono text-xs">
                          <span title={c.sellUnit && c.importUnit ? `${c.sellUnit} · nhập ${c.importUnit}` : undefined}>
                            {c.unit}
                          </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                              {c.availableQty != null ? c.availableQty : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {c.nearestExpiryDateIso
                                  ? new Date(c.nearestExpiryDateIso).toLocaleDateString("vi-VN")
                                  : "—"}
                            </td>
                          </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
                {recipe.components.length === 0 && (
                    <p className="p-6 text-center text-sm text-muted-foreground">Quy trình chưa có nguyên liệu.</p>
                )}
              </div>
            </>
        )}
      </div>
  );
}
