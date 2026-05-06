import { useMemo, useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { FilterChip } from "@/components/shared/DataTableToolbar";
import { DateInput } from "@/components/shared/DateInput";
import { useService } from "@/hooks/useService";
import { adminReports, products as productService } from "@/services";
import { formatVND, formatNumber } from "@/lib/format";
import { TrendingUp, Download, ShoppingCart, BarChart3, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

type Group = "daily" | "weekly" | "monthly" | "yearly";
const CATEGORY_COLORS = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#be123c"];

const groupLabel: Record<Group, string> = { daily: "Ngày", weekly: "Tuần", monthly: "Tháng", yearly: "Năm" };

export default function AdminRevenueReport() {
  const [groupBy, setGroupBy] = useState<Group>("daily");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [excelBusy, setExcelBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const productIdsArg = selected.length > 0 ? selected : undefined;
  const selectedKey = selected.length ? [...selected].sort().join(",") : "";

  const { data: reportData, loading, error } = useService(async () => {
    const [rows, productRows, categoryRows, productPage] = await Promise.all([
      adminReports.revenue(from, to, groupBy, productIdsArg),
      adminReports.revenueByProduct(from, to, groupBy, productIdsArg),
      adminReports.revenueByCategory(from, to, groupBy),
      productService.list({ page: 1, pageSize: 100 }),
    ]);
    return { rows, productRows, categoryRows, products: productPage.items };
  }, [from, to, groupBy, selectedKey]);

  const products = reportData?.products ?? [];
  const backendProductRows = reportData?.productRows ?? [];
  const backendCategoryRows = reportData?.categoryRows ?? [];

  const filteredProductSlices = useMemo(
    () =>
      backendProductRows.map((r) => ({
        name: String(r.productName ?? r.name ?? "—"),
        revenue: Number(r.merchandiseNetRevenue ?? r.revenue ?? r.totalRevenue ?? r.totalAmount ?? 0),
        qty: Number(r.totalQty ?? r.qty ?? r.quantitySold ?? 0),
      })),
    [backendProductRows],
  );

  const unfilteredCategorySlices = useMemo(
    () =>
      backendCategoryRows.map((r) => ({
        name: String(r.categoryName ?? r.name ?? "Không phân loại"),
        revenue: Number(r.revenue ?? r.totalRevenue ?? r.merchandiseNetRevenue ?? 0),
      })),
    [backendCategoryRows],
  );

  const pieCategorySlices = useMemo(() => {
    const categoryRows = [...unfilteredCategorySlices].sort((a, b) => b.revenue - a.revenue);
    if (categoryRows.length <= 7) return categoryRows;
    const rest = categoryRows.slice(7).reduce((s, r) => s + r.revenue, 0);
    return rest > 0 ? [...categoryRows.slice(0, 7), { name: "Khác", revenue: rest }] : categoryRows.slice(0, 7);
  }, [unfilteredCategorySlices]);

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
  const rows = useMemo(() => reportData?.rows ?? [], [reportData]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const totalItems = rows.reduce((s, r) => s + r.itemsSold, 0);

  const pickerProducts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code?: string }>();
    for (const p of products) map.set(p.id, { id: p.id, name: p.name, code: p.code });
    for (const r of backendProductRows) {
      const id = String(r.productId ?? r.id ?? "");
      if (!id || map.has(id)) continue;
      map.set(id, { id, name: String(r.productName ?? r.name ?? id), code: String(r.productCode ?? r.code ?? "") });
    }
    const q = pickerSearch.trim().toLowerCase();
    return [...map.values()].filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.code ?? "").toLowerCase().includes(q));
  }, [backendProductRows, pickerSearch, products]);
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
        <span className="text-xs text-muted-foreground">Nhóm theo:</span>
        {(["daily", "weekly", "monthly", "yearly"] as Group[]).map((g) => (
          <FilterChip key={g} label={groupLabel[g]} active={groupBy === g} onClick={() => setGroupBy(g)} />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <DateInput value={from} onChange={setFrom} />
          <span className="text-xs text-muted-foreground">—</span>
          <DateInput value={to} onChange={setTo} />

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
              <div className="absolute right-0 top-full mt-1 w-72 bg-popover border rounded-md shadow-lg z-30 animate-fade-in">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      autoFocus
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Tìm sản phẩm..."
                      className="w-full h-8 pl-8 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  {pickerProducts.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">Không tìm thấy</p>
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
        </div>
      </div>

      {isFiltered && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const p = pickerProducts.find((x) => x.id === id) ?? products.find((x) => x.id === id);
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

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Biểu đồ theo kỳ dùng dữ liệu từ <code className="text-foreground">/api/revenue/total</code>
        {isFiltered ? " với query productIds." : "."} Không có phép nhân theo tỷ trọng ở client.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-card rounded-lg border p-4">
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

        <div className="bg-card rounded-lg border p-4">
          <h3 className="font-semibold text-sm mb-3">{isFiltered ? "Doanh thu theo sản phẩm đã chọn" : "Doanh thu theo danh mục"}</h3>
          <ChartContainer config={{ revenue: { label: "Doanh thu", color: "hsl(var(--success))" } }} className="h-72 w-full">
            {isFiltered ? (
            <BarChart data={filteredProductSlices.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="prodBarFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={120} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as { name: string; revenue: number; qty?: number };
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                      <p className="font-semibold">{row.name || label}</p>
                      <p>Doanh thu hàng hóa: <b>{formatVND(row.revenue)}</b></p>
                      {row.qty != null && <p>SL bán: <b>{formatNumber(row.qty)}</b></p>}
                    </div>
                  );
                }}
              />
              <Bar dataKey="revenue" fill="url(#prodBarFill)" radius={[0, 6, 6, 0]} />
            </BarChart>
            ) : (
            <PieChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as { name: string; revenue: number };
                  return (
                    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                      <p className="font-semibold">{row.name}</p>
                      <p>Doanh thu hàng hóa: <b>{formatVND(row.revenue)}</b></p>
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Pie data={pieCategorySlices} dataKey="revenue" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={3} stroke="hsl(var(--background))" strokeWidth={2}>
                {pieCategorySlices.map((entry, index) => (
                  <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            )}
          </ChartContainer>
          <div className="hidden">
            {(isFiltered ? filteredProductSlices : unfilteredCategorySlices).map((r, i) => {
              const list = isFiltered
                ? filteredProductSlices
                : unfilteredCategorySlices;
              const maxRev = Math.max(...list.map((x) => x.revenue), 1);
              const barPct = (r.revenue / maxRev) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-32 shrink-0 truncate">{r.name}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="text-xs font-medium w-24 text-right shrink-0">{formatVND(r.revenue)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Chi tiết theo {groupLabel[groupBy].toLowerCase()}</h3>
          <span className="text-[11px] text-muted-foreground">{rows.length} dòng</span>
        </div>
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

      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">{isFiltered ? "Sản phẩm đã chọn" : "Sản phẩm bán chạy"}</h3>
        </div>
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
            {productTableRows.map((r, i) => (
              <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.qty)}</td>
                <td className="px-3 py-2 text-right font-medium text-primary">{formatVND(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
