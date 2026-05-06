import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { production } from "@/services";
import { products as productService } from "@/services";
import type {
  ProductionOrderDto,
  ProductionRecipeDto,
  ProductionPreviewDto,
} from "@/services/production/ProductionAdminService";
import type { Product } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { BarcodePrintDialog, type BarcodeItem } from "@/components/shared/BarcodePrintDialog";
import { Loader2, Plus, RefreshCw, Factory, Eye, Trash2, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Admin Production (Slice 6): recipes, preview/create orders, void. Dense layout — matches other admin pages. */
export default function AdminProduction() {
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<ProductionRecipeDto[]>([]);
  const [orders, setOrders] = useState<ProductionOrderDto[]>([]);
  const [productOptions, setProductOptions] = useState<Product[]>([]);
  const [preview, setPreview] = useState<ProductionPreviewDto | null>(null);
  const [orderDetail, setOrderDetail] = useState<ProductionOrderDto | null>(null);
  const [voidOrderId, setVoidOrderId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [outputLabelOpen, setOutputLabelOpen] = useState(false);
  const [outputLabelItems, setOutputLabelItems] = useState<BarcodeItem[]>([]);

  const [recipeSearch, setRecipeSearch] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState<string>("");

  const recipeSearchRef = useRef(recipeSearch);
  const orderQueryRef = useRef(orderQuery);
  const orderStatusRef = useRef(orderStatus);
  recipeSearchRef.current = recipeSearch;
  orderQueryRef.current = orderQuery;
  orderStatusRef.current = orderStatus;

  /** Avoid toast storms when APIs fail repeatedly (e.g. recipe_code BYTEA / 500 loops). */
  const recipeErrToastAt = useRef(0);
  const orderErrToastAt = useRef(0);
  const productErrToastAt = useRef(0);
  const ERR_TOAST_GAP_MS = 6000;

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const pg = await production.listRecipes({
        page: 1,
        pageSize: 100,
        query: recipeSearchRef.current.trim() || undefined,
      });
      setRecipes(pg.items);
      recipeErrToastAt.current = 0;
    } catch (e) {
      const now = Date.now();
      if (now - recipeErrToastAt.current >= ERR_TOAST_GAP_MS) {
        recipeErrToastAt.current = now;
        toast.error(e instanceof Error ? e.message : "Không tải công thức");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const pg = await production.listOrders({
        page: 1,
        pageSize: 50,
        query: orderQueryRef.current.trim() || undefined,
        status: orderStatusRef.current || undefined,
      });
      setOrders(pg.items);
      orderErrToastAt.current = 0;
    } catch (e) {
      const now = Date.now();
      if (now - orderErrToastAt.current >= ERR_TOAST_GAP_MS) {
        orderErrToastAt.current = now;
        toast.error(e instanceof Error ? e.message : "Không tải phiếu sản xuất");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const pg = await productService.list({ pageSize: 500 });
      setProductOptions(pg.items);
      productErrToastAt.current = 0;
    } catch {
      const now = Date.now();
      if (now - productErrToastAt.current >= ERR_TOAST_GAP_MS) {
        productErrToastAt.current = now;
        toast.error("Không tải danh sách sản phẩm");
      }
    }
  }, []);

  useEffect(() => {
    void loadRecipes();
    void loadProducts();
    void loadOrders();
  }, [loadRecipes, loadOrders, loadProducts]);

  const openOutputBatchLabel = (o: ProductionOrderDto) => {
    const bid = o.outputBatchId;
    if (bid == null) {
      toast.error("Phiếu chưa có outputBatchId — không in tem lô.");
      return;
    }
    const prod = productOptions.find((p) => Number(p.id) === o.outputProductId);
    const variant = prod?.variants.find((v) => Number(v.id) === o.outputVariantId);
    const price = variant?.sellPrice ?? 0;
    setOutputLabelItems([
      {
        productName: prod?.name ?? `SP #${o.outputProductId}`,
        variantName: variant?.name ?? `Variant #${o.outputVariantId}`,
        code: `BATCH:${bid}`,
        price,
        lot: o.outputBatchCode ?? undefined,
        expiryDate: (o.outputExpiryDateIso ?? "").slice(0, 10),
        defaultQty: Math.max(1, o.outputQty),
      },
    ]);
    setOutputLabelOpen(true);
  };

  const statusBadgeCls = (s: string) =>
    s === "completed"
      ? "bg-success-soft text-success border-success/20"
      : s === "voided"
      ? "bg-danger-soft text-danger border-danger/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className="space-y-5 admin-dense min-w-0 max-w-full">
      <PageHeader
        title="Sản xuất / đóng gói"
        description="Quy trình (recipe), preview FEFO, lệnh sản xuất và void."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void loadRecipes();
                void loadOrders();
              }}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button size="sm" asChild>
              <Link to="/admin/production/recipes/new">
                <Plus className="h-4 w-4 mr-1.5" /> Tạo quy trình
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="recipes" className="min-w-0">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="recipes">Quy trình</TabsTrigger>
          <TabsTrigger value="run">Preview / tạo lệnh</TabsTrigger>
          <TabsTrigger value="orders">Phiếu SX</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="mt-4 space-y-3 min-w-0">
          <div className="bg-card rounded-lg border p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 min-w-0">
                <Label className="text-xs font-medium text-muted-foreground">Tìm mã / tên quy trình</Label>
                <Input
                  className="mt-1"
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadRecipes()}
                  placeholder="Lọc…"
                />
              </div>
              <Button type="button" variant="secondary" className="shrink-0 self-end" onClick={() => void loadRecipes()}>
                Áp dụng
              </Button>
            </div>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden min-w-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Mã</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Tên</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">SL output</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Bán/POS</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Arch</th>
                  <th className="text-right w-[140px] px-3 py-2.5 font-medium text-muted-foreground">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs">{r.recipeCode}</td>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.outputQty}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border",
                        r.outputMustBeSellable ? "bg-success-soft text-success border-success/20" : "bg-muted text-muted-foreground border-border",
                      )}>
                        {r.outputMustBeSellable ? "Có" : "Nội bộ"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground">{r.archived ? "✓" : ""}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
                          <Link to={`/admin/production/recipes/${r.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Chi tiết
                          </Link>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-danger hover:text-danger"
                            disabled={r.archived}
                            onClick={async () => {
                              if (!confirm(`Archive ${r.recipeCode}?`)) return;
                              try {
                                await production.archiveRecipe(r.id);
                                toast.success("Đã archive");
                                void loadRecipes();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Lỗi");
                              }
                            }}
                        >
                          Archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {recipes.length === 0 && !loading && (
              <p className="p-6 text-center text-muted-foreground text-sm">Chưa có quy trình.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="run" className="mt-4 space-y-3">
          <RunProductionPanel
            recipes={recipes}
            onPreview={(p) => setPreview(p)}
            preview={preview}
            loadRecipes={loadRecipes}
            loadOrders={loadOrders}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3 min-w-0">
          <div className="bg-card rounded-lg border p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 min-w-0">
                <Label className="text-xs font-medium text-muted-foreground">Tìm số phiếu / mã hay tên công thức</Label>
                <Input
                  className="mt-1"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadOrders()}
                  placeholder="VD: PO-, RCP-, …"
                />
              </div>
              <div className="w-full sm:w-44 shrink-0">
                <Label className="text-xs font-medium text-muted-foreground">Trạng thái</Label>
                <Select value={orderStatus || "__all"} onValueChange={(v) => setOrderStatus(v === "__all" ? "" : v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Tất cả</SelectItem>
                    <SelectItem value="completed">completed</SelectItem>
                    <SelectItem value="voided">voided</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="secondary" className="shrink-0 self-end" onClick={() => void loadOrders()}>
                Áp dụng
              </Button>
            </div>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden min-w-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Mã lệnh</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Trạng thái</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">SL TP</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-[180px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs">{o.orderNo}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border", statusBadgeCls(o.status))}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.outputQty}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={async () => {
                            try {
                              const full = await production.getOrder(o.id);
                              setOrderDetail(full);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Lỗi");
                            }
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> Chi tiết
                        </Button>
                        {o.status === "completed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-danger hover:text-danger"
                            onClick={() => setVoidOrderId(o.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Void
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {orders.length === 0 && !loading && (
              <p className="p-6 text-center text-muted-foreground text-sm">Chưa có phiếu phù hợp bộ lọc.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!orderDetail} onOpenChange={(o) => !o && setOrderDetail(null)}>
        <DialogContent className="w-[calc(100vw-1.25rem)] sm:w-full max-w-4xl max-h-[92vh] overflow-y-auto px-4 sm:px-6">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold break-all">
                {orderDetail?.orderNo}
              </DialogTitle>
              {orderDetail && (
                  <span
                      className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border",
                          statusBadgeCls(orderDetail.status),
                      )}
                  >
            {orderDetail.status}
          </span>
              )}
              {orderDetail?.outputMustBeSellable === false && (
                  <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border bg-muted text-muted-foreground border-border">
            Nội bộ
          </span>
              )}
            </div>
          </DialogHeader>

          {orderDetail && (
              <div className="space-y-4 text-sm">
                {/* Tổng quan */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Thành phẩm</p>
                    <p className="font-medium font-mono text-xs mt-0.5">
                      variant #{orderDetail.outputVariantId}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Số lượng</p>
                    <p className="font-semibold tabular-nums mt-0.5">{orderDetail.outputQty}</p>
                  </div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Đơn giá output</p>
                    <p className="font-semibold tabular-nums mt-0.5">
                      {String(orderDetail.outputUnitCost)}
                    </p>
                  </div>
                </div>

                {/* Lô output */}
                <div className="bg-card border rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Lô output</p>
                  <div className="grid gap-2 sm:grid-cols-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Mã lô: </span>
                      <span className="font-mono">{orderDetail.outputBatchCode ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Batch ID: </span>
                      <span className="font-mono">{orderDetail.outputBatchId ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">HSD: </span>
                      <span className="font-medium">
                {orderDetail.outputExpiryDateIso?.slice(0, 10) ?? "—"}
              </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={orderDetail.outputBatchId == null}
                        onClick={() => openOutputBatchLabel(orderDetail)}
                    >
                      <Printer className="h-3.5 w-3.5 mr-1" /> In tem lô
                    </Button>
                  </div>
                </div>

                {/* Components + allocations */}
                <div className="bg-card border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30">
                    <p className="text-xs font-semibold">Nguyên liệu tiêu hao & phân bổ lô</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Variant</th>
                        <th className="text-right px-3 py-2 font-medium">Cần</th>
                        <th className="text-right px-3 py-2 font-medium">Đã dùng</th>
                        <th className="text-center px-3 py-2 font-medium">Đ.vị</th>
                        <th className="text-left px-3 py-2 font-medium">Phân bổ</th>
                      </tr>
                      </thead>
                      <tbody>
                      {orderDetail.components.map((c) => (
                          <tr key={c.id} className="border-b last:border-0 align-top">
                            <td className="px-3 py-2 font-mono">#{c.variantId}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.requiredQty}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.consumedQty}</td>
                            <td className="px-3 py-2 text-center font-mono">{c.unit}</td>
                            <td className="px-3 py-2">
                              {c.allocations.length === 0 ? (
                                  <span className="text-muted-foreground">—</span>
                              ) : (
                                  <ul className="space-y-0.5">
                                    {c.allocations.map((a) => (
                                        <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                                          <span className="font-mono text-[11px]">{a.lotCode}</span>
                                          <span className="text-muted-foreground">×</span>
                                          <span className="tabular-nums">{a.qty}</span>
                                          <span className="text-muted-foreground">@</span>
                                          <span className="tabular-nums">{String(a.unitCost)}</span>
                                          {a.expiryDateIso && (
                                              <span className="text-muted-foreground text-[10px]">
                                  HSD {a.expiryDateIso.slice(0, 10)}
                                </span>
                                          )}
                                        </li>
                                    ))}
                                  </ul>
                              )}
                            </td>
                          </tr>
                      ))}
                      {orderDetail.components.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                              Không có dòng nguyên liệu.
                            </td>
                          </tr>
                      )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Ghi chú / void */}
                {(orderDetail.note || orderDetail.voidReason) && (
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      {orderDetail.note && (
                          <div className="rounded-md border bg-muted/30 px-3 py-2">
                            <p className="text-[11px] text-muted-foreground">Ghi chú</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{orderDetail.note}</p>
                          </div>
                      )}
                      {orderDetail.voidReason && (
                          <div className="rounded-md border bg-danger-soft/40 border-danger/20 px-3 py-2">
                            <p className="text-[11px] text-danger">Lý do void</p>
                            <p className="mt-0.5 whitespace-pre-wrap">{orderDetail.voidReason}</p>
                            {orderDetail.voidedAtIso && (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {new Date(orderDetail.voidedAtIso).toLocaleString()}
                                </p>
                            )}
                          </div>
                      )}
                    </div>
                )}

                <details className="rounded-md border bg-muted/30">
                  <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                    Chi tiết kỹ thuật (JSON)
                  </summary>
                  <pre className="text-[10px] bg-background/40 p-2 whitespace-pre-wrap break-all max-h-[42vh] overflow-auto">
            {JSON.stringify(orderDetail, null, 2)}
          </pre>
                </details>
              </div>
          )}
        </DialogContent>
      </Dialog>


      <BarcodePrintDialog
        open={outputLabelOpen}
        onClose={() => setOutputLabelOpen(false)}
        title="In tem lô thành phẩm"
        items={outputLabelItems}
      />

      <Dialog open={voidOrderId != null} onOpenChange={(o) => !o && setVoidOrderId(null)}>
        <DialogContent className="w-[calc(100vw-1.25rem)] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Void phiếu</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Lý do</Label>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="h-8 text-xs" />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              onClick={async () => {
                if (voidOrderId == null) return;
                try {
                  await production.voidOrder(voidOrderId, { reason: voidReason || undefined });
                  toast.success("Đã void");
                  setVoidOrderId(null);
                  setVoidReason("");
                  void loadOrders();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Lỗi void");
                }
              }}
            >
              Xác nhận void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RunProductionPanel(props: {
  recipes: ProductionRecipeDto[];
  preview: ProductionPreviewDto | null;
  onPreview: (p: ProductionPreviewDto) => void;
  loadRecipes: () => void;
  loadOrders: () => void;
}) {
  const { recipes, preview, onPreview, loadRecipes, loadOrders } = props;
  const [recipeId, setRecipeId] = useState<number | "">("");
  const [outputQty, setOutputQty] = useState(1);
  const [overhead, setOverhead] = useState("");
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    if (recipeId === "") return;
    setBusy(true);
    try {
      const p = await production.previewOrder({
        recipeId: Number(recipeId),
        outputQty,
        overheadCost: overhead ? Number(overhead) : undefined,
      });
      onPreview(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview lỗi");
    } finally {
      setBusy(false);
    }
  };

  const runCreate = async () => {
    if (recipeId === "") return;
    setBusy(true);
    try {
      await production.createOrder({
        recipeId: Number(recipeId),
        outputQty,
        overheadCost: overhead ? Number(overhead) : undefined,
        note: null,
      });
      toast.success("Đã tạo lệnh SX");
      void loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tạo lệnh lỗi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 min-w-0">
      <div className="space-y-4 bg-card border rounded-lg p-4 min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Factory className="h-4 w-4 shrink-0 text-primary" /> Preview / tạo lệnh
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Quy trình</Label>
          <Select
            value={recipeId === "" ? "" : String(recipeId)}
            onValueChange={(v) => setRecipeId(v ? Number(v) : "")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn recipe" />
            </SelectTrigger>
            <SelectContent>
              {recipes
                .filter((r) => !r.archived && r.active)
                .map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.recipeCode} — {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">SL thành phẩm</Label>
            <Input
              type="number"
              min={1}
              value={outputQty}
              onChange={(e) => setOutputQty(Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Chi phí chung (₫)</Label>
            <Input
              value={overhead}
              onChange={(e) => setOverhead(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy} onClick={() => void runPreview()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null} Preview
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void runCreate()}>
            Tạo lệnh hoàn tất
          </Button>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-4 text-sm space-y-2 max-h-[min(32rem,65vh)] min-h-[12rem] overflow-auto min-w-0">
        {preview ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-2">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Max sản xuất được</p>
                <p className="font-semibold tabular-nums">{preview.maxProducibleQty}</p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Đơn giá ước tính</p>
                <p className="font-semibold tabular-nums">{String(preview.estimatedOutputUnitCost)}</p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">HSD dự kiến</p>
                <p className="font-semibold">{preview.expectedOutputExpiryDateIso}</p>
              </div>
            </div>
            <Separator />
            {preview.components.map((c, i) => (
              <div key={i} className="border-b pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                <p className="font-medium text-xs">
                  Variant {c.variantId} — cần {c.requiredQty}, còn {c.availableQty} {c.unit}
                </p>
                <ul className="text-[11px] text-muted-foreground ml-3 mt-1 list-disc">
                  {c.allocations.map((a, j) => (
                    <li key={j}>
                      lô <span className="font-mono">{a.lotCode}</span> ×{a.qty} @ {String(a.unitCost)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <div className="flex items-center justify-center h-full min-h-[10rem]">
            <p className="text-muted-foreground text-sm">Chạy Preview để xem FEFO.</p>
          </div>
        )}
      </div>
    </div>
  );
}
