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

  return (
    <div className="space-y-4 admin-dense min-w-0 max-w-full">
      <PageHeader
        title="Sản xuất / đóng gói"
        description="Quy trình (recipe), preview FEFO, lệnh sản xuất và void."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                void loadRecipes();
                void loadOrders();
              }}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button size="sm" className="h-8 text-xs" asChild>
              <Link to="/admin/production/recipes/new">
                <Plus className="h-3.5 w-3.5 mr-1" /> Tạo quy trình
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="recipes" className="min-w-0">
        <TabsList className="h-auto min-h-9 flex-wrap gap-0.5 w-full sm:w-auto">
          <TabsTrigger value="recipes" className="text-xs">
            Quy trình
          </TabsTrigger>
          <TabsTrigger value="run" className="text-xs">
            Preview / tạo lệnh
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">
            Phiếu SX
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="mt-4 space-y-2 min-w-0">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-muted-foreground">Tìm mã / tên quy trình</Label>
              <Input
                className="h-8 text-xs mt-0.5"
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadRecipes()}
                placeholder="Lọc…"
              />
            </div>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs shrink-0" onClick={() => void loadRecipes()}>
              Áp dụng
            </Button>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden min-w-0">
            <div className="overflow-x-auto -mx-px">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 py-1.5">Mã</th>
                  <th className="text-left px-2 py-1.5">Tên</th>
                  <th className="text-right px-2 py-1.5">SL output</th>
                  <th className="text-center px-2 py-1.5">Bán/POS</th>
                  <th className="text-center px-2 py-1.5">Arch</th>
                  <th className="text-right w-[140px] px-2 py-1.5">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-2 py-2 font-mono">{r.recipeCode}</td>
                    <td className="px-2 py-2">{r.name}</td>
                    <td className="px-2 py-2 text-right">{r.outputQty}</td>
                    <td className="px-2 py-2 text-center text-[10px] leading-tight">
                      {r.outputMustBeSellable ? "Có" : "Nội bộ"}
                    </td>
                    <td className="px-2 py-2 text-center">{r.archived ? "✓" : ""}</td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {recipes.length === 0 && !loading && (
              <p className="p-4 text-muted-foreground text-xs">Chưa có quy trình.</p>
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

        <TabsContent value="orders" className="mt-4 space-y-2 min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-muted-foreground">Tìm số phiếu / mã hay tên công thức</Label>
              <Input
                className="h-8 text-xs mt-0.5"
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadOrders()}
                placeholder="VD: PO-, RCP-, …"
              />
            </div>
            <div className="w-full sm:w-40 shrink-0">
              <Label className="text-[10px] text-muted-foreground">Trạng thái</Label>
              <Select value={orderStatus || "__all"} onValueChange={(v) => setOrderStatus(v === "__all" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs mt-0.5">
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all" className="text-xs">
                    Tất cả
                  </SelectItem>
                  <SelectItem value="completed" className="text-xs">
                    completed
                  </SelectItem>
                  <SelectItem value="voided" className="text-xs">
                    voided
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs shrink-0 self-end" onClick={() => void loadOrders()}>
              Áp dụng
            </Button>
          </div>
          <div className="bg-card rounded-lg border overflow-hidden min-w-0">
            <div className="overflow-x-auto -mx-px">
            <table className="w-full text-xs min-w-[360px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 py-1.5">Mã lệnh</th>
                  <th className="text-left px-2 py-1.5">Trạng thái</th>
                  <th className="text-right px-2 py-1.5">SL TP</th>
                  <th className="text-right px-2 py-1.5 w-[110px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-2 py-2 font-mono">{o.orderNo}</td>
                    <td className="px-2 py-2">{o.status}</td>
                    <td className="px-2 py-2 text-right">{o.outputQty}</td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px]"
                        onClick={async () => {
                          try {
                            const full = await production.getOrder(o.id);
                            setOrderDetail(full);
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Lỗi");
                          }
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Chi tiết
                      </Button>
                      {o.status === "completed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] text-destructive"
                          onClick={() => setVoidOrderId(o.id)}
                        >
                          <Trash2 className="h-3 w-3" /> Void
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {orders.length === 0 && !loading && (
              <p className="p-4 text-muted-foreground text-xs">Chưa có phiếu phù hợp bộ lọc.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!orderDetail} onOpenChange={(o) => !o && setOrderDetail(null)}>
        <DialogContent className="w-[calc(100vw-1.25rem)] sm:w-full max-w-3xl max-h-[92vh] overflow-y-auto text-xs px-4">
          <DialogHeader>
            <DialogTitle className="text-sm break-all">{orderDetail?.orderNo}</DialogTitle>
          </DialogHeader>
          {orderDetail && (
            <div className="space-y-2 text-[11px]">
              <p>
                <span className="text-muted-foreground">Trạng thái:</span>{" "}
                <span className="font-medium">{orderDetail.status}</span>
              </p>
              <p>
                <span className="text-muted-foreground">TP / SL:</span> variant{" "}
                <span className="font-mono">{orderDetail.outputVariantId}</span> × {orderDetail.outputQty}{" "}
                {orderDetail.outputMustBeSellable === false ? (
                  <span className="text-muted-foreground">(thành phẩm nội bộ / bán nguồn khác, không chỉ POS)</span>
                ) : (
                  <span className="text-muted-foreground">(bán qua POS / gian hàng)</span>
                )}
              </p>
              {orderDetail.outputBatchCode ? (
                <p>
                  <span className="text-muted-foreground">Lô output:</span>{" "}
                  <span className="font-mono">{orderDetail.outputBatchCode}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px]"
                  disabled={orderDetail.outputBatchId == null}
                  onClick={() => openOutputBatchLabel(orderDetail)}
                >
                  <Printer className="h-3.5 w-3.5 mr-1" /> In tem lô (BATCH:{orderDetail.outputBatchId ?? "—"})
                </Button>
              </div>
              <Separator />
              <p className="text-muted-foreground font-medium text-[10px]">Chi tiết kỹ thuật (JSON)</p>
              <pre className="text-[10px] bg-muted/50 p-2 rounded whitespace-pre-wrap break-all max-h-[42vh] overflow-auto">
                {JSON.stringify(orderDetail, null, 2)}
              </pre>
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
    <div className="grid gap-4 md:grid-cols-2 min-w-0">
      <div className="space-y-3 bg-card border rounded-lg p-3 min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Factory className="h-4 w-4 shrink-0" /> Preview / tạo lệnh
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px]">Quy trình</Label>
          <Select
            value={recipeId === "" ? "" : String(recipeId)}
            onValueChange={(v) => setRecipeId(v ? Number(v) : "")}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Chọn recipe" />
            </SelectTrigger>
            <SelectContent>
              {recipes
                .filter((r) => !r.archived && r.active)
                .map((r) => (
                  <SelectItem key={r.id} value={String(r.id)} className="text-xs">
                    {r.recipeCode} — {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">SL thành phẩm</Label>
            <Input
              type="number"
              min={1}
              className="h-8 text-xs"
              value={outputQty}
              onChange={(e) => setOutputQty(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label className="text-[10px]">Chi phí chung (₫)</Label>
            <Input
              className="h-8 text-xs"
              value={overhead}
              onChange={(e) => setOverhead(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => void runPreview()}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Preview
          </Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void runCreate()}>
            Tạo lệnh hoàn tất
          </Button>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-3 text-xs space-y-2 max-h-[min(28rem,60vh)] min-h-32 overflow-auto min-w-0">
        {preview ? (
          <>
            <p>
              <span className="text-muted-foreground">Max sản xuất được:</span> {preview.maxProducibleQty}
            </p>
            <p>
              <span className="text-muted-foreground">Đơn giá ước tính:</span>{" "}
              {String(preview.estimatedOutputUnitCost)}
            </p>
            <p>
              <span className="text-muted-foreground">HSD dự kiến:</span> {preview.expectedOutputExpiryDateIso}
            </p>
            <Separator />
            {preview.components.map((c, i) => (
              <div key={i} className="border-b pb-2 mb-2 last:border-0">
                <p className="font-medium">
                  Variant {c.variantId} — cần {c.requiredQty}, còn {c.availableQty} {c.unit}
                </p>
                <ul className="text-[10px] text-muted-foreground ml-2">
                  {c.allocations.map((a, j) => (
                    <li key={j}>
                      lô {a.lotCode} ×{a.qty} @ {String(a.unitCost)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <p className="text-muted-foreground">Chạy Preview để xem FEFO.</p>
        )}
      </div>
    </div>
  );
}