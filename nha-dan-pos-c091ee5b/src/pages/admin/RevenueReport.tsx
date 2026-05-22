import { useMemo, useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { FilterChip } from "@/components/shared/DataTableToolbar";
import { DateInput } from "@/components/shared/DateInput";
import { TablePagination } from "@/components/shared/TablePagination";
import { useService } from "@/hooks/useService";
import { adminReports, products as productService, categories as categoryService } from "@/services";
import type { CategoryRevenueSeriesRow } from "@/services/adminBackend";
import { formatVND, formatNumber } from "@/lib/format";
import { TrendingUp, Download, ShoppingCart, BarChart3, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { localToday } from "@/lib/localDate";
import { cn } from "@/lib/utils";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

type Group = "daily" | "weekly" | "monthly" | "yearly";
const CATEGORY_COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#be123c", "#0f766e", "#9333ea", "#64748b"];

const groupLabel: Record<Group, string> = { daily: "Ngày", weekly: "Tuần", monthly: "Tháng", yearly: "Năm" };

function categorySeriesKey(row: Pick<CategoryRevenueSeriesRow, "categoryId" | "categoryName">): string {
  return `cat_${row.categoryId}_${row.categoryName.replace(/[^\p{L}\p{N}]+/gu, "_")}`;
}

export default function AdminRevenueReport() {
  const [groupBy, setGroupBy] = useState<Group>("daily");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(localToday());
  const [excelBusy, setExcelBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryPickerSearch, setCategoryPickerSearch] = useState("");
  const categoryPickerRef = useRef<HTMLDivElement>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; name: string; active?: boolean }[]>([]);
  const [categoryOptionsLoading, setCategoryOptionsLoading] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(20);
  const PRODUCT_PAGE_SIZE_OPTIONS = [20, 50, 100];
  const [categoryChartMode, setCategoryChartMode] = useState<"value" | "percent">("value");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (categoryPickerRef.current && !categoryPickerRef.current.contains(e.target as Node)) setCategoryPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const productIdsArg = selected.length > 0 ? selected : undefined;
  const selectedKey = selected.length ? [...selected].sort().join(",") : "";
  const categoryIdsArg = selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined;
  const selectedCategoryKey = selectedCategoryIds.length ? [...selectedCategoryIds].sort().join(",") : "";

  const { data: reportData, loading, error } = useService(async () => {
    const [rows, productRows, categorySeries] = await Promise.all([
      adminReports.revenue(from, to, groupBy, productIdsArg),
      adminReports.revenueByProduct(from, to, groupBy, productIdsArg),
      adminReports.revenueByCategorySeries(from, to, groupBy, categoryIdsArg),
    ]);
    return { rows, productRows, categorySeries };
  }, [from, to, groupBy, selectedKey, selectedCategoryKey]);

  const backendProductRows = reportData?.productRows ?? [];
  const backendCategorySeries = reportData?.categorySeries ?? [];

  // Debounced backend product search for the picker. Admin/staff JWT: /api/products?search
  // matches product name/code and any variant code/name (incl. inactive/non-sellable variant rows).
  // Storefront anonymous search uses stricter variant match. Selection remains productId.
  const [pickerProducts, setPickerProducts] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setPickerLoading(true);
    const handle = setTimeout(async () => {
      try {
        const page = await productService.list({
          page: 1,
          pageSize: 20,
          query: pickerSearch.trim() || undefined,
        });
        if (cancelled) return;
        setPickerProducts(
            page.items.map((p) => ({ id: p.id, name: p.name, code: p.code })),
        );
      } catch (e) {
        if (!cancelled) {
          setPickerProducts([]);
          toast.error(e instanceof Error ? e.message : "Không tải danh sách sản phẩm");
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [pickerOpen, pickerSearch]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    let cancelled = false;
    setCategoryOptionsLoading(true);
    categoryService.list({ includeInactive: true })
        .then((page) => {
          if (cancelled) return;
          setCategoryOptions(page.items.map((c) => ({ id: String(c.id), name: c.name, active: c.active })));
        })
        .catch((e) => {
          if (!cancelled) {
            setCategoryOptions([]);
            toast.error(e instanceof Error ? e.message : "Không tải danh sách danh mục");
          }
        })
        .finally(() => {
          if (!cancelled) setCategoryOptionsLoading(false);
        });
    return () => { cancelled = true; };
  }, [categoryPickerOpen]);

  const visibleCategoryOptions = useMemo(() => {
    const q = categoryPickerSearch.trim().toLowerCase();
    if (!q) return categoryOptions;
    return categoryOptions.filter((c) => c.name.toLowerCase().includes(q) || c.id.includes(q));
  }, [categoryOptions, categoryPickerSearch]);

  const categorySeriesMeta = useMemo(() => {
    const map = new Map<string, { key: string; id: string; name: string }>();
    const totals = new Map<string, number>();
    for (const row of backendCategorySeries) {
      const key = categorySeriesKey(row);
      if (!map.has(key)) map.set(key, { key, id: row.categoryId, name: row.categoryName });
      totals.set(key, (totals.get(key) ?? 0) + (Number(row.revenue) || 0));
    }
    // Sort by total revenue desc so the largest category sits at the bottom of the stack.
    return [...map.values()].sort((a, b) => (totals.get(b.key) ?? 0) - (totals.get(a.key) ?? 0));
  }, [backendCategorySeries]);

  const categoryChartRows = useMemo(() => {
    const byPeriod = new Map<string, Record<string, string | number>>();
    for (const row of backendCategorySeries) {
      const existing = byPeriod.get(row.periodKey) ?? {
        periodKey: row.periodKey,
        periodLabel: row.periodLabel,
      };
      existing[categorySeriesKey(row)] = row.revenue;
      byPeriod.set(row.periodKey, existing);
    }
    return [...byPeriod.values()];
  }, [backendCategorySeries]);

  // Normalized rows for the 100% stacked (percent) mode.
  const categoryChartRowsPercent = useMemo(() => {
    return categoryChartRows.map((row) => {
      let total = 0;
      for (const meta of categorySeriesMeta) total += Number(row[meta.key] ?? 0);
      const next: Record<string, string | number> = {
        periodKey: row.periodKey as string,
        periodLabel: row.periodLabel as string,
      };
      for (const meta of categorySeriesMeta) {
        const v = Number(row[meta.key] ?? 0);
        next[meta.key] = total > 0 ? +((v / total) * 100).toFixed(2) : 0;
      }
      return next;
    });
  }, [categoryChartRows, categorySeriesMeta]);

  const categoryChartHasRevenue = useMemo(
      () => backendCategorySeries.some((row) => row.revenue > 0),
      [backendCategorySeries],
  );

  const legacyCategoryOnly = useMemo(
      () => categorySeriesMeta.length === 1 && categorySeriesMeta[0]?.name === "Unknown/Legacy Category",
      [categorySeriesMeta],
  );

  const productTableRows = useMemo(
      () =>
          backendProductRows.map((r, i) => ({
            name: String(r.productName ?? r.name ?? "Sản phẩm"),
            qty: Number(r.totalQty ?? r.qty ?? r.quantitySold ?? 0),
            revenue: Number(r.merchandiseNetRevenue ?? r.revenue ?? r.totalRevenue ?? r.totalAmount ?? 0),
            key: String(r.productId ?? r.id ?? i),
          })),
      [backendProductRows],
  );

  const isFiltered = selected.length > 0;

  // Reset to first page when filters that affect the dataset change
  useEffect(() => {
    setProductPage(1);
  }, [from, to, groupBy, selectedKey]);

  const productTotal = productTableRows.length;
  const productTotalPages = Math.max(1, Math.ceil(productTotal / productPageSize));
  const currentProductPage = Math.min(productPage, productTotalPages);
  const productRangeStart = productTotal === 0 ? 0 : (currentProductPage - 1) * productPageSize + 1;
  const productRangeEnd = Math.min(productTotal, currentProductPage * productPageSize);
  const pagedProductRows = useMemo(
      () => productTableRows.slice((currentProductPage - 1) * productPageSize, currentProductPage * productPageSize),
      [productTableRows, currentProductPage, productPageSize],
  );
  const rows = useMemo(() => reportData?.rows ?? [], [reportData]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const totalItems = rows.reduce((s, r) => s + r.itemsSold, 0);

  // Mutual exclusive: product filter and category filter cannot be active at the same time.
  const toggle = (id: string) =>
      setSelected((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        if (next.length > 0 && selectedCategoryIds.length > 0) setSelectedCategoryIds([]);
        return next;
      });
  const toggleCategory = (id: string) =>
      setSelectedCategoryIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        if (next.length > 0 && selected.length > 0) setSelected([]);
        return next;
      });

  const selectedProductChartRows = useMemo(() => {
    if (!isFiltered) return [];
    const selectedSet = new Set(selected);
    return productTableRows
        .filter((r) => selectedSet.has(r.key))
        .sort((a, b) => b.revenue - a.revenue);
  }, [isFiltered, selected, productTableRows]);
  const maxSelectedProductRevenue = useMemo(
      () => selectedProductChartRows.reduce((m, r) => Math.max(m, r.revenue), 0),
      [selectedProductChartRows],
  );

  const handleExportExcel = async () => {
    try {
      setExcelBusy(true);
      await adminReports.downloadRevenueTotalExcel(from, to, groupBy);
      toast.success("Đã tải file Excel doanh thu");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xuất Excel được");
    } finally {
      setExcelBusy(false);
    }
  };

  return (
      <div className="space-y-4 admin-dense">
        <PageHeader
            title="Doanh thu"
            description={
              isFiltered
                  ? `Đang phân tích ${selected.length} sản phẩm — nhóm theo ${groupLabel[groupBy].toLowerCase()} (API lọc productIds)`
                  : `Báo cáo doanh thu — nhóm theo ${groupLabel[groupBy].toLowerCase()}`
            }
            actions={
              <button
                  type="button"
                  disabled={excelBusy}
                  onClick={() => void handleExportExcel()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> {excelBusy ? "Đang xuất…" : "Xuất Excel"}
              </button>
            }
        />
        {loading && <p className="text-sm text-muted-foreground">Đang tải báo cáo doanh thu từ backend...</p>}
        {error && <p className="text-sm text-danger">Không tải được báo cáo doanh thu: {error.message}</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={TrendingUp} title="Tổng doanh thu" value={formatVND(totalRevenue)} variant="primary" />
          <StatCard icon={ShoppingCart} title="Hóa đơn" value={formatNumber(totalInvoices)} />
          <StatCard icon={BarChart3} title="SP đã bán" value={formatNumber(totalItems)} variant="success" />
          <StatCard icon={TrendingUp} title="TB/hóa đơn" value={totalInvoices ? formatVND(Math.round(totalRevenue / totalInvoices)) : "—"} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Nhóm theo:</span>
            {(["daily", "weekly", "monthly", "yearly"] as Group[]).map((g) => (
                <FilterChip key={g} label={groupLabel[g]} active={groupBy === g} onClick={() => setGroupBy(g)} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <div className="flex items-center gap-2 min-w-0">
              <DateInput value={from} onChange={setFrom} />
              <span className="text-xs text-muted-foreground">—</span>
              <DateInput value={to} onChange={setTo} />
            </div>

            <div className="relative" ref={pickerRef}>
              <button
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  className={cn(
                      "flex items-center gap-1.5 h-8 px-3 text-xs font-medium border rounded-md hover:bg-muted",
                      isFiltered && "border-primary text-primary bg-primary-soft",
                  )}
              >
                <Search className="h-3.5 w-3.5" />
                {isFiltered ? `${selected.length} sản phẩm` : "Lọc theo sản phẩm"}
              </button>
              {pickerOpen && (
                  <div className="absolute right-0 top-full mt-1 w-80 bg-popover border rounded-lg shadow-lg z-30 animate-fade-in">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            autoFocus
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            placeholder="Tìm sản phẩm / mã sản phẩm / mã variant"
                            className="w-full h-8 pl-8 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto scrollbar-thin">
                      {pickerLoading ? (
                          <p className="p-4 text-center text-xs text-muted-foreground">Đang tìm kiếm...</p>
                      ) : pickerProducts.length === 0 ? (
                          <p className="p-4 text-center text-xs text-muted-foreground">Không tìm thấy sản phẩm phù hợp</p>
                      ) : (
                          pickerProducts.map((p) => {
                            const checked = selected.includes(p.id);
                            return (
                                <button
                                    type="button"
                                    key={p.id}
                                    onClick={() => toggle(p.id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted text-left"
                                >
                          <span
                              className={cn(
                                  "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                                  checked ? "bg-primary border-primary" : "border-input",
                              )}
                          >
                            {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                          </span>
                                  <span className="flex-1 truncate">{p.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">{p.code}</span>
                                </button>
                            );
                          })
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/30">
                      <button type="button" onClick={() => setSelected([])} className="text-[11px] text-muted-foreground hover:text-foreground">
                        Xóa lọc
                      </button>
                      <button type="button" onClick={() => setPickerOpen(false)} className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md">
                        Xong
                      </button>
                    </div>
                  </div>
              )}
            </div>

            <div className="relative" ref={categoryPickerRef}>
              <button
                  type="button"
                  onClick={() => setCategoryPickerOpen((o) => !o)}
                  className={cn(
                      "flex items-center gap-1.5 h-8 px-3 text-xs font-medium border rounded-md hover:bg-muted",
                      selectedCategoryIds.length > 0 && "border-success text-success bg-success-soft",
                  )}
              >
                <Search className="h-3.5 w-3.5" />
                {selectedCategoryIds.length ? `${selectedCategoryIds.length} danh mục` : "Lọc danh mục"}
              </button>
              {categoryPickerOpen && (
                  <div className="absolute right-0 top-full mt-1 w-80 bg-popover border rounded-lg shadow-lg z-30 animate-fade-in">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            autoFocus
                            value={categoryPickerSearch}
                            onChange={(e) => setCategoryPickerSearch(e.target.value)}
                            placeholder="Tìm danh mục"
                            className="w-full h-8 pl-8 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto scrollbar-thin">
                      {categoryOptionsLoading ? (
                          <p className="p-4 text-center text-xs text-muted-foreground">Đang tải danh mục...</p>
                      ) : visibleCategoryOptions.length === 0 ? (
                          <p className="p-4 text-center text-xs text-muted-foreground">Không có danh mục phù hợp</p>
                      ) : (
                          visibleCategoryOptions.map((cat) => {
                            const checked = selectedCategoryIds.includes(cat.id);
                            return (
                                <button
                                    type="button"
                                    key={cat.id}
                                    onClick={() => toggleCategory(cat.id)}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted text-left"
                                >
                          <span className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0", checked ? "bg-success border-success" : "border-input")}>
                            {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                          </span>
                                  <span className="flex-1 truncate">
                            {cat.name}{cat.active === false ? " (ngưng hoạt động)" : ""}
                          </span>
                                </button>
                            );
                          })
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/30">
                      <button type="button" onClick={() => setSelectedCategoryIds([])} className="text-[11px] text-muted-foreground hover:text-foreground">
                        Xóa lọc
                      </button>
                      <button type="button" onClick={() => setCategoryPickerOpen(false)} className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md">
                        Xong
                      </button>
                    </div>
                  </div>
              )}
            </div>
          </div>
        </div>

        {isFiltered && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((id) => {
                const fromPicker = pickerProducts.find((x) => x.id === id);
                const fromBackend = backendProductRows.find((r) => String(r.productId ?? r.id) === id);
                const p = fromPicker
                    ?? (fromBackend ? { id, name: String(fromBackend.productName ?? fromBackend.name ?? id), code: String(fromBackend.productCode ?? "") } : null);
                if (!p) return null;
                return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-primary-soft text-primary rounded-full">
                {p.name}
                      <button type="button" onClick={() => toggle(id)} className="hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
                );
              })}
            </div>
        )}

        {selectedCategoryIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedCategoryIds.map((id) => {
                const option = categoryOptions.find((x) => x.id === id);
                const fromSeries = categorySeriesMeta.find((x) => x.id === id);
                const name = option ? `${option.name}${option.active === false ? " (ngưng hoạt động)" : ""}` : fromSeries?.name ?? `Danh mục #${id}`;
                return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-success-soft text-success rounded-full">
                {name}
                      <button type="button" onClick={() => toggleCategory(id)} className="hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
                );
              })}
            </div>
        )}

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          Biểu đồ theo kỳ dùng dữ liệu từ <code className="text-foreground">/api/revenue/total</code>
          {isFiltered ? " với query productIds." : "."} Không có phép nhân theo tỷ trọng ở client.
          {' '}Biểu đồ danh mục dùng <code className="text-foreground">/api/revenue/by-category-series</code> và backend quyết định Top 10 + Khác.
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-card rounded-lg border p-3 sm:p-4">
            <h3 className="font-semibold text-sm mb-3">Doanh thu theo {groupLabel[groupBy].toLowerCase()}</h3>
            <ChartContainer config={{ revenue: { label: "Doanh thu", color: "hsl(var(--primary))" } }} className="h-72 w-full">
              <AreaChart data={rows} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                    cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as typeof rows[number];
                      return (
                          <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                            <p className="font-semibold">{label}</p>
                            <p>Doanh thu: <b>{formatVND(row.revenue)}</b></p>
                            <p>Hóa đơn: <b>{formatNumber(row.invoiceCount)}</b></p>
                            <p>SP bán: <b>{formatNumber(row.itemsSold)}</b></p>
                          </div>
                      );
                    }}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#revFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} />
              </AreaChart>
            </ChartContainer>
            <div className="hidden">
              {rows.map((r, i) => {
                const maxRev = Math.max(...rows.map((x) => x.revenue), 1);
                const pct = (r.revenue / maxRev) * 100;
                return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{r.period}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-medium w-24 text-right shrink-0">{formatVND(r.revenue)}</span>
                    </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card rounded-lg border p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="font-semibold text-sm">
                {isFiltered ? "Doanh thu theo sản phẩm đã chọn" : "Doanh thu theo danh mục"}
              </h3>
              <div className="flex items-center gap-2">
                {!isFiltered && (
                    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-[11px]">
                      <button
                          type="button"
                          onClick={() => setCategoryChartMode("value")}
                          className={cn(
                              "px-2 py-0.5 rounded-sm transition-colors",
                              categoryChartMode === "value" ? "bg-background shadow-sm font-medium" : "text-muted-foreground",
                          )}
                      >
                        ₫
                      </button>
                      <button
                          type="button"
                          onClick={() => setCategoryChartMode("percent")}
                          className={cn(
                              "px-2 py-0.5 rounded-sm transition-colors",
                              categoryChartMode === "percent" ? "bg-background shadow-sm font-medium" : "text-muted-foreground",
                          )}
                      >
                        %
                      </button>
                    </div>
                )}
                <span className="text-[11px] text-muted-foreground">
                {isFiltered
                    ? `${selectedProductChartRows.length} sản phẩm`
                    : selectedCategoryIds.length > 0
                        ? "Danh mục đã chọn"
                        : "Top 10 + Khác từ backend"}
              </span>
              </div>
            </div>
            {isFiltered ? (
                <div className="h-72 w-full overflow-y-auto scrollbar-thin pr-1">
                  {selectedProductChartRows.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md">
                        Không có dữ liệu doanh thu sản phẩm trong khoảng đã chọn
                      </div>
                  ) : (
                      <ul className="space-y-2">
                        {selectedProductChartRows.map((r) => {
                          const pct = maxSelectedProductRevenue > 0
                              ? Math.max(2, (r.revenue / maxSelectedProductRevenue) * 100)
                              : 0;
                          return (
                              <li key={r.key} className="space-y-1">
                                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2 min-w-0">
                                  <span className="text-xs font-medium break-words sm:truncate min-w-0">{r.name}</span>
                                  <span className="text-xs font-semibold text-success sm:shrink-0 tabular-nums">
                            {formatVND(r.revenue)}
                          </span>
                                </div>
                                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                      className="h-full rounded-full bg-success transition-all"
                                      style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </li>
                          );
                        })}
                      </ul>
                  )}
                </div>
            ) : (
                <ChartContainer config={{}} className="h-72 w-full">
                  {categoryChartRows.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md">
                        Không có dữ liệu doanh thu danh mục trong khoảng đã chọn
                      </div>
                  ) : (
                      (() => {
                        const isDaily = groupBy === "daily";
                        const isPercent = categoryChartMode === "percent";
                        const ChartCmp: typeof BarChart | typeof AreaChart = isDaily ? BarChart : AreaChart;
                        const SeriesCmp: typeof Bar | typeof Area = isDaily ? Bar : Area;
                        const data = isPercent ? categoryChartRowsPercent : categoryChartRows;
                        const lastIndex = categorySeriesMeta.length - 1;
                        return (
                            <ChartCmp data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis
                                  dataKey="periodLabel"
                                  tickLine={false}
                                  axisLine={false}
                                  tickMargin={8}
                                  minTickGap={isDaily ? 8 : 24}
                                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              />
                              <YAxis
                                  tickLine={false}
                                  axisLine={false}
                                  width={isPercent ? 36 : 48}
                                  domain={isPercent ? [0, 100] : undefined}
                                  tickFormatter={(v) => (isPercent ? `${Math.round(Number(v))}%` : `${Math.round(Number(v) / 1000)}k`)}
                                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              />
                              <Tooltip
                                  cursor={isDaily
                                      ? { fill: "hsl(var(--muted))", opacity: 0.4 }
                                      : { stroke: "hsl(var(--success))", strokeWidth: 1, strokeDasharray: "3 3" }}
                                  content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const visible = [...payload]
                                        .filter((p) => Number(p.value ?? 0) > 0)
                                        .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
                                    const total = visible.reduce((s, p) => s + Number(p.value ?? 0), 0);
                                    return (
                                        <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl max-w-xs">
                                          <p className="font-semibold mb-1">{label}</p>
                                          <div className="space-y-0.5">
                                            {visible.map((item) => (
                                                <p key={String(item.dataKey)} className="flex items-center justify-between gap-3">
                                                  <span className="truncate flex items-center gap-1.5" style={{ color: item.color }}>
                                                    <span className="inline-block w-2 h-2 rounded-sm" style={{ background: item.color }} />
                                                    {item.name}
                                                  </span>
                                                  <b>{isPercent ? `${Number(item.value ?? 0).toFixed(1)}%` : formatVND(Number(item.value ?? 0))}</b>
                                                </p>
                                            ))}
                                          </div>
                                          {!isPercent && visible.length > 1 && (
                                              <div className="mt-1 pt-1 border-t flex items-center justify-between gap-3">
                                                <span className="text-muted-foreground">Tổng</span>
                                                <b>{formatVND(total)}</b>
                                              </div>
                                          )}
                                        </div>
                                    );
                                  }}
                              />
                              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                              {categorySeriesMeta.map((series, index) => {
                                const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                                const common = {
                                  dataKey: series.key,
                                  name: series.name,
                                  stackId: "revenue",
                                  isAnimationActive: false,
                                } as const;
                                if (isDaily) {
                                  return (
                                      <Bar
                                          key={series.key}
                                          {...common}
                                          fill={color}
                                          radius={index === lastIndex ? [4, 4, 0, 0] : 0}
                                      />
                                  );
                                }
                                return (
                                    <Area
                                        key={series.key}
                                        {...common}
                                        type="monotone"
                                        stroke={color}
                                        fill={color}
                                        fillOpacity={0.55}
                                        strokeWidth={1.5}
                                    />
                                );
                              })}
                            </ChartCmp>
                        );
                      })()
                  )}
                </ChartContainer>
            )}
            {!isFiltered && legacyCategoryOnly && (
                <p className="mt-2 text-[11px] text-warning">
                  Dữ liệu cũ chưa có snapshot danh mục nên không thể tách theo danh mục thật.
                </p>
            )}
            {!isFiltered && !categoryChartHasRevenue && categoryChartRows.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">Danh mục đã chọn không có doanh thu trong khoảng này.</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Chi tiết theo {groupLabel[groupBy].toLowerCase()}</h3>
            <span className="text-[11px] text-muted-foreground">{rows.length} dòng</span>
          </div>
          {/* Mobile: stacked card list — no horizontal scroll */}
          <ul className="sm:hidden divide-y">
            {rows.map((r, i) => (
                <li key={`m-${i}`} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{r.period}</span>
                    <span className="text-primary font-semibold text-sm">{formatVND(r.revenue)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div><span className="block text-[10px] uppercase tracking-wide">Hóa đơn</span><span className="text-foreground font-medium">{r.invoiceCount}</span></div>
                    <div><span className="block text-[10px] uppercase tracking-wide">SP bán</span><span className="text-foreground font-medium">{r.itemsSold}</span></div>
                    <div className="text-right"><span className="block text-[10px] uppercase tracking-wide">TB/HĐ</span><span className="text-foreground font-medium">{r.invoiceCount ? formatVND(Math.round(r.revenue / r.invoiceCount)) : "—"}</span></div>
                  </div>
                </li>
            ))}
            <li className="px-3 py-2.5 bg-muted/50 font-semibold">
              <div className="flex items-center justify-between text-sm">
                <span>Tổng</span>
                <span className="text-primary">{formatVND(totalRevenue)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] mt-1">
                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Hóa đơn</span>{totalInvoices}</div>
                <div><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">SP bán</span>{totalItems}</div>
                <div className="text-right"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">TB/HĐ</span>{totalInvoices ? formatVND(Math.round(totalRevenue / totalInvoices)) : "—"}</div>
              </div>
            </li>
          </ul>
          {/* Desktop / tablet: full table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Kỳ</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Doanh thu</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Hóa đơn</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">SP bán</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">TB/hóa đơn</th>
              </tr>
              </thead>
              <tbody>
              {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-medium">{r.period}</td>
                    <td className="px-3 py-2.5 text-right text-primary font-medium">{formatVND(r.revenue)}</td>
                    <td className="px-3 py-2.5 text-center">{r.invoiceCount}</td>
                    <td className="px-3 py-2.5 text-center">{r.itemsSold}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      {r.invoiceCount ? formatVND(Math.round(r.revenue / r.invoiceCount)) : "—"}
                    </td>
                  </tr>
              ))}
              </tbody>
              <tfoot>
              <tr className="bg-muted/50 font-bold">
                <td className="px-3 py-2">Tổng</td>
                <td className="px-3 py-2 text-right text-primary">{formatVND(totalRevenue)}</td>
                <td className="px-3 py-2 text-center">{totalInvoices}</td>
                <td className="px-3 py-2 text-center">{totalItems}</td>
                <td className="px-3 py-2 text-right">{totalInvoices ? formatVND(Math.round(totalRevenue / totalInvoices)) : "—"}</td>
              </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">{isFiltered ? "Doanh thu theo sản phẩm đã chọn" : "Doanh thu theo sản phẩm"}</h3>
          </div>
          {/* Mobile: card list */}
          <ul className="sm:hidden divide-y">
            {pagedProductRows.map((r, i) => (
                <li key={`mp-${r.key}`} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted-foreground">#{productRangeStart + i}</div>
                      <div className="font-medium text-sm truncate">{r.name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-primary font-semibold text-sm">{formatVND(r.revenue)}</div>
                      <div className="text-[11px] text-muted-foreground">SL: {formatNumber(r.qty)}</div>
                    </div>
                  </div>
                </li>
            ))}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sản phẩm</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">SL bán</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Doanh thu</th>
              </tr>
              </thead>
              <tbody>
              {pagedProductRows.map((r, i) => (
                  <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{productRangeStart + i}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(r.qty)}</td>
                    <td className="px-3 py-2 text-right font-medium text-primary">{formatVND(r.revenue)}</td>
                  </tr>
              ))}
              </tbody>
            </table>
          </div>
          {productTotal > 0 && (
              <div className="px-4 py-2 border-t">
                <TablePagination
                    page={currentProductPage}
                    totalPages={productTotalPages}
                    total={productTotal}
                    rangeStart={productRangeStart}
                    rangeEnd={productRangeEnd}
                    pageSize={productPageSize}
                    onPageChange={setProductPage}
                    onPageSizeChange={(n) => { setProductPageSize(n); setProductPage(1); }}
                    pageSizeOptions={PRODUCT_PAGE_SIZE_OPTIONS}
                />
              </div>
          )}
        </div>
      </div>
  );
}
