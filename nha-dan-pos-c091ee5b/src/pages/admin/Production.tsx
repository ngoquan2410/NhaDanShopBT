import { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { production } from "@/services";
import { products as productService } from "@/services";
import { AdminApiError } from "@/services/auth/adminApi";
import type {
  ProductionOrderDto,
  ProductionRecipeDto,
  ProductionPreviewDto,
  ProductionShortageDetailDto,
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
import { Loader2, Plus, RefreshCw, Factory, Eye, Trash2, Printer, ChevronsUpDown, Check } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/shared/TablePagination";
import { SortableTh } from "@/components/shared/SortableTh";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { SortDirection } from "@/services/types";

/** Admin Production (Slice 6): recipes, preview/create orders, void. Dense layout — matches other admin pages. */
export default function AdminProduction() {
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<ProductionRecipeDto[]>([]);
  const [orders, setOrders] = useState<ProductionOrderDto[]>([]);
  const [recipesTotal, setRecipesTotal] = useState(0);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [productOptions, setProductOptions] = useState<Product[]>([]);
  const [preview, setPreview] = useState<ProductionPreviewDto | null>(null);
  const [orderDetail, setOrderDetail] = useState<ProductionOrderDto | null>(null);
  const [voidOrderId, setVoidOrderId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [outputLabelOpen, setOutputLabelOpen] = useState(false);
  const [outputLabelItems, setOutputLabelItems] = useState<BarcodeItem[]>([]);

  const [recipeSearchInput, setRecipeSearchInput] = useState("");
  const [orderSearchInput, setOrderSearchInput] = useState("");
  const debouncedRecipeSearch = useDebouncedValue(recipeSearchInput, 350);
  const debouncedOrderSearch = useDebouncedValue(orderSearchInput, 350);
  const [recipePage, setRecipePage] = useState(1);
  const [recipePageSize, setRecipePageSize] = useState(20);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(20);
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [recipeSort, setRecipeSort] = useState<{ field: string; direction: SortDirection }>({
    field: "id",
    direction: "desc",
  });
  const [orderSort, setOrderSort] = useState<{ field: string; direction: SortDirection }>({
    field: "createdAt",
    direction: "desc",
  });

  /** Avoid toast storms when APIs fail repeatedly (e.g. recipe_code BYTEA / 500 loops). */
  const recipeErrToastAt = useRef(0);
  const orderErrToastAt = useRef(0);
  const productErrToastAt = useRef(0);
  const ERR_TOAST_GAP_MS = 6000;

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const pg = await production.listRecipes({
        page: recipePage,
        pageSize: recipePageSize,
        query: debouncedRecipeSearch || undefined,
        sort: [recipeSort],
      });
      setRecipes(pg.items);
      setRecipesTotal(pg.total);
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
  }, [debouncedRecipeSearch, recipePage, recipePageSize, recipeSort]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const pg = await production.listOrders({
        page: orderPage,
        pageSize: orderPageSize,
        query: debouncedOrderSearch || undefined,
        status: orderStatus || undefined,
        sort: [orderSort],
      });
      setOrders(pg.items);
      setOrdersTotal(pg.total);
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
  }, [debouncedOrderSearch, orderPage, orderPageSize, orderSort, orderStatus]);

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
  }, [loadRecipes]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const toggleRecipeSort = (field: string) => {
    setRecipePage(1);
    setRecipeSort((prev) =>
        prev.field === field
            ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
            : { field, direction: "asc" },
    );
  };
  const toggleOrderSort = (field: string) => {
    setOrderPage(1);
    setOrderSort((prev) =>
        prev.field === field
            ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
            : { field, direction: "asc" },
    );
  };

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
                      value={recipeSearchInput}
                      onChange={(e) => {
                        setRecipePage(1);
                        setRecipeSearchInput(e.target.value);
                      }}
                      placeholder="Lọc…"
                  />
                </div>
              </div>
            </div>
            <div className="bg-card rounded-lg border overflow-hidden min-w-0">
              {/* Mobile cards */}
              <ul className="sm:hidden divide-y">
                {recipes.map((r) => (
                    <li key={`mr-${r.id}`} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Link to={`/admin/production/recipes/${r.id}`} className="font-mono text-xs text-primary hover:underline">{r.recipeCode}</Link>
                          <p className="font-medium text-sm truncate">{r.name}</p>
                          <div className="flex items-center gap-2 mt-1 text-[11px]">
                            <span className="text-muted-foreground">SL: <span className="text-foreground tabular-nums">{r.outputQty}</span></span>
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 font-medium border", r.outputMustBeSellable ? "bg-success-soft text-success border-success/20" : "bg-muted text-muted-foreground border-border")}>{r.outputMustBeSellable ? "Bán/POS" : "Nội bộ"}</span>
                            {r.archived && <span className="text-muted-foreground">Archived</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild><Link to={`/admin/production/recipes/${r.id}`}><Eye className="h-3.5 w-3.5 mr-1" /> Chi tiết</Link></Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-danger hover:text-danger" disabled={r.archived} onClick={async () => { if (!confirm(`Archive ${r.recipeCode}?`)) return; try { await production.archiveRecipe(r.id); toast.success("Đã archive"); void loadRecipes(); } catch (e) { toast.error(e instanceof Error ? e.message : "Lỗi"); } }}>Archive</Button>
                        </div>
                      </div>
                    </li>
                ))}
              </ul>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                  <tr className="border-b bg-muted/50">
                    <SortableTh label="Mã" sortKey="recipeCode" sort={{ key: recipeSort.field, dir: recipeSort.direction }} onSort={toggleRecipeSort} />
                    <SortableTh label="Tên" sortKey="name" sort={{ key: recipeSort.field, dir: recipeSort.direction }} onSort={toggleRecipeSort} />
                    <SortableTh label="SL output" sortKey="outputQty" sort={{ key: recipeSort.field, dir: recipeSort.direction }} onSort={toggleRecipeSort} align="right" />
                    <SortableTh label="Bán/POS" sortKey="outputMustBeSellable" sort={{ key: recipeSort.field, dir: recipeSort.direction }} onSort={toggleRecipeSort} align="center" />
                    <SortableTh label="Arch" sortKey="archived" sort={{ key: recipeSort.field, dir: recipeSort.direction }} onSort={toggleRecipeSort} align="center" />
                    <th className="text-right w-[140px] px-3 py-2.5 font-medium text-muted-foreground">Thao tác</th>
                  </tr>
                  </thead>
                  <tbody>
                  {recipes.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-xs">
                          <Link
                              to={`/admin/production/recipes/${r.id}`}
                              className="text-primary hover:underline underline-offset-2 inline-flex items-center gap-1"
                          >
                            {r.recipeCode}
                          </Link>
                        </td>
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
            <TablePagination
                page={recipePage}
                totalPages={Math.max(1, Math.ceil(recipesTotal / recipePageSize))}
                total={recipesTotal}
                rangeStart={recipesTotal === 0 ? 0 : (recipePage - 1) * recipePageSize + 1}
                rangeEnd={Math.min(recipePage * recipePageSize, recipesTotal)}
                pageSize={recipePageSize}
                onPageChange={setRecipePage}
                onPageSizeChange={(value) => {
                  setRecipePage(1);
                  setRecipePageSize(value);
                }}
            />
          </TabsContent>

          <TabsContent value="run" className="mt-4 space-y-3">
            <RunProductionPanel
                recipes={recipes}
                onPreview={(p) => setPreview(p)}
                preview={preview}
                loadRecipes={loadRecipes}
                loadOrders={loadOrders}
                productOptions={productOptions}
            />
          </TabsContent>

          <TabsContent value="orders" className="mt-4 space-y-3 min-w-0">
            <div className="bg-card rounded-lg border p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 min-w-0">
                  <Label className="text-xs font-medium text-muted-foreground">Tìm số phiếu / mã hay tên công thức</Label>
                  <Input
                      className="mt-1"
                      value={orderSearchInput}
                      onChange={(e) => {
                        setOrderPage(1);
                        setOrderSearchInput(e.target.value);
                      }}
                      placeholder="VD: PO-, RCP-, …"
                  />
                </div>
                <div className="w-full sm:w-44 shrink-0">
                  <Label className="text-xs font-medium text-muted-foreground">Trạng thái</Label>
                  <Select value={orderStatus || "__all"} onValueChange={(v) => {
                    setOrderPage(1);
                    setOrderStatus(v === "__all" ? "" : v);
                  }}>
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
              </div>
            </div>
            <div className="bg-card rounded-lg border overflow-hidden min-w-0">
              {/* Mobile cards */}
              <ul className="sm:hidden divide-y">
                {orders.map((o) => (
                    <li key={`mo-${o.id}`} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs">{o.orderNo}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium border", statusBadgeCls(o.status))}>{o.status}</span>
                            <span className="text-[11px] text-muted-foreground">SL TP: <span className="text-foreground tabular-nums">{o.outputQty}</span></span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{o.createdAtIso ? new Date(o.createdAtIso).toLocaleString() : "—"}</div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => { try { const full = await production.getOrder(o.id); setOrderDetail(full); } catch (e) { toast.error(e instanceof Error ? e.message : "Lỗi"); } }}><Eye className="h-3.5 w-3.5 mr-1" /> Chi tiết</Button>
                          {o.status === "completed" && (<Button variant="ghost" size="sm" className="h-7 text-xs text-danger hover:text-danger" onClick={() => setVoidOrderId(o.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Void</Button>)}
                        </div>
                      </div>
                    </li>
                ))}
              </ul>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                  <tr className="border-b bg-muted/50">
                    <SortableTh label="Mã lệnh" sortKey="orderNo" sort={{ key: orderSort.field, dir: orderSort.direction }} onSort={toggleOrderSort} />
                    <SortableTh label="Trạng thái" sortKey="status" sort={{ key: orderSort.field, dir: orderSort.direction }} onSort={toggleOrderSort} />
                    <SortableTh label="SL TP" sortKey="outputQty" sort={{ key: orderSort.field, dir: orderSort.direction }} onSort={toggleOrderSort} align="right" />
                    <SortableTh label="Ngày tạo" sortKey="createdAt" sort={{ key: orderSort.field, dir: orderSort.direction }} onSort={toggleOrderSort} align="center" />
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
                        <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                          {o.createdAtIso ? new Date(o.createdAtIso).toLocaleString() : "—"}
                        </td>
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
            <TablePagination
                page={orderPage}
                totalPages={Math.max(1, Math.ceil(ordersTotal / orderPageSize))}
                total={ordersTotal}
                rangeStart={ordersTotal === 0 ? 0 : (orderPage - 1) * orderPageSize + 1}
                rangeEnd={Math.min(orderPage * orderPageSize, ordersTotal)}
                pageSize={orderPageSize}
                onPageChange={setOrderPage}
                onPageSizeChange={(value) => {
                  setOrderPage(1);
                  setOrderPageSize(value);
                }}
            />
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
                        {(() => {
                          const outputProduct = productOptions.find((p) => Number(p.id) === orderDetail.outputProductId);
                          const outputVariant = outputProduct?.variants?.find(
                              (v) => Number(v.id) === orderDetail.outputVariantId,
                          );
                          if (outputProduct?.name || outputVariant?.name || outputVariant?.code) {
                            return `${outputProduct?.name ?? "Sản phẩm"} - ${outputVariant?.name ?? outputVariant?.code ?? `variant #${orderDetail.outputVariantId}`}`;
                          }
                          return `variant #${orderDetail.outputVariantId}`;
                        })()}
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
                              <td className="px-3 py-2">
                                <div className="font-medium">
                                  {c.productName || "Sản phẩm"}
                                </div>
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  {c.variantName || c.variantCode || `variant #${c.variantId}`}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{c.requiredQty}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{c.consumedQty}</td>
                              <td className="px-3 py-2 text-center font-mono">{c.unit}</td>
                              <td className="px-3 py-2">
                                {c.allocations.length === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                ) : (
                                    <ul className="space-y-0.5">
                                      {[...c.allocations]
                                          .sort((a, b) => {
                                            const ai = a.allocationIndex ?? Number.MAX_SAFE_INTEGER;
                                            const bi = b.allocationIndex ?? Number.MAX_SAFE_INTEGER;
                                            if (ai !== bi) return ai - bi;
                                            return a.id - b.id;
                                          })
                                          .map((a) => (
                                              <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                                          <span className="font-mono text-[11px]">
                                            {a.lotCode || `#${a.batchId}`}
                                          </span>
                                                <span className="text-muted-foreground">×</span>
                                                <span className="tabular-nums">{a.qty}</span>
                                                <span className="text-muted-foreground">@</span>
                                                <span className="tabular-nums">{String(a.unitCost)}</span>
                                                {a.totalCost != null && (
                                                    <>
                                                      <span className="text-muted-foreground">=</span>
                                                      <span className="tabular-nums">{String(a.totalCost)}</span>
                                                    </>
                                                )}
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
  productOptions: Product[];
}) {
  const { recipes, preview, onPreview, loadRecipes, loadOrders, productOptions } = props;

  /** Tìm nhãn hiển thị tốt nhất cho variantId từ danh sách product đã load. */
  const variantLabel = (variantId: number | string) => {
    for (const p of productOptions) {
      const v = p.variants?.find((x) => String(x.id) === String(variantId));
      if (v) return `${p.name} · ${v.name || v.code}`;
    }
    return `Variant ${variantId}`;
  };
  const [recipeId, setRecipeId] = useState<number | "">("");
  const [recipeSelectorOpen, setRecipeSelectorOpen] = useState(false);
  const [selectorSearchInput, setSelectorSearchInput] = useState("");
  const debouncedSelectorSearch = useDebouncedValue(selectorSearchInput, 350);
  const [selectorRecipes, setSelectorRecipes] = useState<ProductionRecipeDto[]>([]);
  const [selectorLoading, setSelectorLoading] = useState(false);
  const [outputQty, setOutputQty] = useState(1);
  const [overhead, setOverhead] = useState("");
  const [busy, setBusy] = useState(false);
  const [shortages, setShortages] = useState<ProductionShortageDetailDto[]>([]);
  const hasMissingFromPreview = (preview?.components ?? []).some((c) => Number(c.missingQty ?? 0) > 0);
  const selectedRecipeFromList = selectorRecipes.find((r) => r.id === recipeId) ?? recipes.find((r) => r.id === recipeId);
  const selectedRecipeLabel = selectedRecipeFromList ? `${selectedRecipeFromList.recipeCode} — ${selectedRecipeFromList.name}` : "";

  useEffect(() => {
    let mounted = true;
    const loadSelector = async () => {
      setSelectorLoading(true);
      try {
        const page = await production.listRecipes({
          page: 1,
          pageSize: 20,
          query: debouncedSelectorSearch || undefined,
          active: true,
          includeArchived: false,
          sort: [{ field: "id", direction: "desc" }],
        });
        if (!mounted) return;
        const selected = recipes.find((r) => r.id === recipeId);
        const merged = selected && !page.items.some((r) => r.id === selected.id) ? [selected, ...page.items] : page.items;
        setSelectorRecipes(merged.filter((r) => !r.archived && r.active));
      } catch {
        if (mounted) {
          setSelectorRecipes(recipes.filter((r) => !r.archived && r.active).slice(0, 20));
        }
      } finally {
        if (mounted) setSelectorLoading(false);
      }
    };
    void loadSelector();
    return () => {
      mounted = false;
    };
  }, [debouncedSelectorSearch, recipeId, recipes]);

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
      setShortages([]);
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
      setShortages([]);
      await production.createOrder({
        recipeId: Number(recipeId),
        outputQty,
        overheadCost: overhead ? Number(overhead) : undefined,
        note: null,
      });
      toast.success("Đã tạo lệnh SX");
      void loadOrders();
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 409) {
        const data = (e.data ?? {}) as Record<string, unknown>;
        const details = Array.isArray(data.shortages)
            ? (data.shortages as ProductionShortageDetailDto[])
            : [];
        if (details.length > 0) {
          setShortages(details);
          toast.error("Không đủ tồn nguyên liệu để tạo lệnh");
          return;
        }
      }
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
            <Popover open={recipeSelectorOpen} onOpenChange={setRecipeSelectorOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={recipeSelectorOpen} className="h-8 text-xs justify-between w-full">
                  <span className="truncate">{selectedRecipeLabel || "Chọn recipe"}</span>
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[380px] max-w-[90vw]">
                <Command shouldFilter={false}>
                  <CommandInput
                      placeholder="Tìm mã/tên quy trình..."
                      value={selectorSearchInput}
                      onValueChange={setSelectorSearchInput}
                  />
                  <CommandList>
                    {selectorLoading ? (
                        <div className="p-3 text-xs text-muted-foreground">Đang tải…</div>
                    ) : null}
                    <CommandEmpty>Không tìm thấy quy trình</CommandEmpty>
                    {selectorRecipes.map((r) => (
                        <CommandItem
                            key={r.id}
                            value={`${r.recipeCode} ${r.name}`}
                            onSelect={() => {
                              setRecipeId(r.id);
                              setRecipeSelectorOpen(false);
                            }}
                        >
                          <Check className={cn("mr-2 h-3.5 w-3.5", recipeId === r.id ? "opacity-100" : "opacity-0")} />
                          <span className="text-xs">{r.recipeCode} — {r.name}</span>
                        </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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
              <Label className="text-xs font-medium text-muted-foreground">Chi phí sản xuất bổ sung (₫)</Label>
              <Input
                  value={overhead}
                  onChange={(e) => setOverhead(e.target.value)}
                  placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Chi phí này được cộng vào giá vốn lô thành phẩm. Không tự cập nhật giá bán.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={() => void runPreview()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null} Preview
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || hasMissingFromPreview} onClick={() => void runCreate()}>
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
                {(() => {
                  const missingItems = preview.components.filter(
                      (c) => Number(c.missingQty ?? Math.max(0, Number(c.requiredQty) - Number(c.availableQty))) > 0
                  );
                  if (missingItems.length === 0) return null;
                  return (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                        <p className="font-semibold text-destructive">
                          Thiếu nguyên liệu — không đủ tồn để chạy lệnh này
                        </p>
                        <ul className="mt-1 list-disc ml-4 text-destructive/90">
                          {missingItems.map((c, i) => (
                              <li key={i}>
                                {c.productName ?? variantLabel(c.variantId)}{c.variantName ? ` · ${c.variantName}` : ""}: thiếu{" "}
                                <b>
                                  {Number(c.missingQty ?? Math.max(0, Number(c.requiredQty) - Number(c.availableQty)))} {c.unit}
                                </b>
                              </li>
                          ))}
                        </ul>
                      </div>
                  );
                })()}
                {preview.components.map((c, i) => {
                  const need = Number(c.requiredQty);
                  const have = Number(c.availableQty);
                  const missing = Number(c.missingQty ?? Math.max(0, need - have));
                  const isMissing = missing > 0;
                  return (
                      <div
                          key={i}
                          className={cn(
                              "border-b pb-2 mb-2 last:border-0 last:mb-0 last:pb-0 px-2 py-1.5 rounded",
                              isMissing && "bg-destructive/5 border-l-2 border-l-destructive"
                          )}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-medium text-xs">
                            {c.productName ?? variantLabel(c.variantId)}
                            {c.variantName ? ` · ${c.variantName}` : ""}
                            {c.variantCode ? ` (${c.variantCode})` : ""}
                            {" — "}cần {need}, còn {have} {c.unit}
                          </p>
                          {isMissing && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-destructive text-destructive-foreground">
                        Thiếu {missing} {c.unit}
                      </span>
                          )}
                        </div>
                        <ul className="text-[11px] text-muted-foreground ml-3 mt-1 list-disc">
                          {c.allocations.map((a, j) => (
                              <li key={j}>
                                lô <span className="font-mono">{a.lotCode}</span> ×{a.qty} @ {String(a.unitCost)}
                              </li>
                          ))}
                        </ul>
                      </div>
                  );
                })}
                {shortages.length > 0 && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                      <p className="font-semibold text-destructive">Tạo lệnh thất bại do thiếu nguyên liệu:</p>
                      <ul className="mt-1 list-disc ml-4 text-destructive/90">
                        {shortages.map((s, i) => (
                            <li key={`${s.variantId}-${i}`}>
                              {s.productName ?? `SP ${s.productId}`}
                              {s.variantName ? ` · ${s.variantName}` : ""}
                              {s.variantCode ? ` (${s.variantCode})` : ""}: cần {s.requiredQty}, còn {s.availableQty},
                              thiếu <b>{s.missingQty} {s.unit}</b>
                            </li>
                        ))}
                      </ul>
                    </div>
                )}
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
