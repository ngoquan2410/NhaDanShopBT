import { useMemo, useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DateInput } from "@/components/shared/DateInput";
import { FilterChip } from "@/components/shared/DataTableToolbar";
import { useService } from "@/hooks/useService";
import { adminReports, products as productService } from "@/services";
import { formatVND, formatPercent, formatNumber } from "@/lib/format";
import { DollarSign, TrendingUp, Download, Receipt, Search, X, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { localToday } from "@/lib/localDate";
import { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

type BeProductRow = Record<string, unknown>;
type ProfitGroup = "daily" | "weekly" | "monthly";
const profitGroupLabel: Record<ProfitGroup, string> = { daily: "Ngày", weekly: "Tuần", monthly: "Tháng" };

function numFromRow(row: BeProductRow | undefined, keys: string[]): number | null {
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function mapRowToMetrics(row: BeProductRow | undefined) {
  if (!row) {
    return { revenue: null as number | null, cost: null as number | null, profit: null as number | null, qty: null as number | null };
  }
  const revenue = numFromRow(row, ["merchandiseNetRevenue", "totalAmount", "revenue", "totalRevenue"]);
  const cost = numFromRow(row, ["merchandiseCost", "cogs", "cost"]);
  const profit = numFromRow(row, ["merchandiseNetProfit", "profit", "netProfit"]);
  const qty = numFromRow(row, ["totalQty", "qty", "quantitySold", "quantity"]);
  const profitResolved = profit != null ? profit : revenue != null && cost != null ? revenue - cost : null;
  return { revenue, cost, profit: profitResolved, qty };
}

export default function AdminProfitReport() {
  const [groupBy, setGroupBy] = useState<ProfitGroup>("daily");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(localToday());
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
    const [profitRows, productRowsRaw] = await Promise.all([
      adminReports.profitSeries(from, to, groupBy, productIdsArg),
      adminReports.revenueByProduct(from, to, "daily", productIdsArg),
    ]);
    return { profitRows, productRowsRaw };
  }, [from, to, groupBy, selectedKey]);

  const [pickerHits, setPickerHits] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setPickerLoading(true);
    const handle = setTimeout(async () => {
      try {
        const q = pickerSearch.trim();
        const page = await productService.list({
          page: 1,
          pageSize: 20,
          query: q.length >= 2 ? q : undefined,
        });
        if (cancelled) return;
        setPickerHits(page.items.map((p) => ({ id: p.id, name: p.name, code: p.code })));
      } catch (e) {
        if (!cancelled) {
          setPickerHits([]);
          toast.error(e instanceof Error ? e.message : "Không tải danh sách sản phẩm");
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pickerOpen, pickerSearch]);
  const backendProductRows = (reportData?.productRowsRaw ?? []) as BeProductRow[];
  const profitSeries = reportData?.profitRows ?? [];

  const isFiltered = selected.length > 0;

  const headerRevenue = profitSeries.reduce((s, r) => s + r.revenue, 0);
  const headerCost = profitSeries.reduce((s, r) => s + r.cost, 0);
  const headerProfit = profitSeries.reduce((s, r) => s + r.profit, 0);
  /** Backend trả profitMarginPct dạng 0–100 */
  const headerMarginFraction =
    headerRevenue > 0 ? headerProfit / headerRevenue : 0;

  /** SL bán (đơn vị dòng hàng) — từ báo cáo doanh thu theo SP backend, không suy diễn. */
  const totalSoldQty = useMemo(() => {
    if (!isFiltered) {
      return backendProductRows.reduce((s, r) => s + (numFromRow(r, ["totalQty", "qty", "quantitySold", "quantity"]) ?? 0), 0);
    }
    return selected.reduce((s, id) => {
      const row = backendProductRows.find((x) => String(x.productId ?? x.id) === id);
      const q = numFromRow(row, ["totalQty", "qty", "quantitySold", "quantity"]);
      return s + (q ?? 0);
    }, 0);
  }, [backendProductRows, isFiltered, selected]);

  const chartRows = useMemo(() => {
    const list = backendProductRows.slice(0, 8);
    return list.map((row) => {
      const { revenue, cost, profit, qty } = mapRowToMetrics(row);
      const name = String(row.productName ?? row.name ?? "—");
      const rev = revenue ?? 0;
      const prof = profit ?? (revenue != null && cost != null ? revenue - cost : 0);
      const margin = rev > 0 ? prof / rev : 0;
      return { id: String(row.productId ?? row.id ?? name), name, revenue: rev, profit: prof, margin, qty };
    });
  }, [backendProductRows]);

  const filteredDetailRows = useMemo(() => {
    if (!isFiltered) return [];
    return selected.map((id) => {
      const fromPicker = pickerHits.find((x) => x.id === id);
      const row = backendProductRows.find((x) => String(x.productId ?? x.id) === id);
      const p =
        fromPicker ??
        (row ? { id, name: String(row.productName ?? row.name ?? id), code: String(row.productCode ?? row.code ?? "") } : null);
      const { revenue, cost, profit, qty } = mapRowToMetrics(row);
      const missing = !row || (revenue == null && profit == null);
      const margin = revenue != null && revenue > 0 && profit != null ? profit / revenue : null;
      return {
        id,
        name: p?.name ?? String(row?.productName ?? id),
        revenue,
        cost,
        profit,
        qty,
        margin,
        missing,
      };
    });
  }, [selected, pickerHits, backendProductRows, isFiltered]);

  const footerFiltered = useMemo(() => {
    const withData = filteredDetailRows.filter((r) => !r.missing && r.revenue != null);
    const rev = withData.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const cst = withData.reduce((s, r) => s + (r.cost ?? 0), 0);
    const prof = withData.reduce((s, r) => s + (r.profit ?? 0), 0);
    const q = withData.reduce((s, r) => s + (r.qty ?? 0), 0);
    return { rev, cst, prof, q, margin: rev > 0 ? prof / rev : 0 };
  }, [filteredDetailRows]);

  const money = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "—" : formatVND(n));
  const pct = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "—" : formatPercent(n));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleExportExcel = async () => {
    try {
      setExcelBusy(true);
      await adminReports.downloadProfitExcel(from, to);
      toast.success("Đã tải file Excel lợi nhuận");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xuất Excel được");
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Lợi nhuận"
        description={isFiltered ? `Đang phân tích ${selected.length} sản phẩm (theo dòng hàng HĐ)` : "Báo cáo lợi nhuận kinh doanh"}
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
      {loading && <p className="text-sm text-muted-foreground">Đang tải báo cáo lợi nhuận từ backend...</p>}
      {error && <p className="text-sm text-danger">Không tải được báo cáo lợi nhuận: {error.message}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={TrendingUp} title="Doanh thu" value={formatVND(headerRevenue)} variant="primary" valueTestId="admin-profit-stat-revenue" />
        <StatCard icon={DollarSign} title="Giá vốn" value={formatVND(headerCost)} valueTestId="admin-profit-stat-cost" />
        <StatCard
          icon={DollarSign}
          title="Lợi nhuận"
          value={formatVND(headerProfit)}
          variant="success"
          valueTestId="admin-profit-stat-profit"
          trend={{ value: formatPercent(headerMarginFraction), positive: headerProfit > 0 }}
        />
        <StatCard icon={Receipt} title="SL bán (dòng SP)" value={formatNumber(totalSoldQty)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateInput value={from} onChange={setFrom} />
        <span className="text-xs text-muted-foreground">—</span>
        <DateInput value={to} onChange={setTo} />
        <span className="ml-2 text-xs text-muted-foreground">Nhóm theo:</span>
        {(["daily", "weekly", "monthly"] as ProfitGroup[]).map((g) => (
          <FilterChip key={g} label={profitGroupLabel[g]} active={groupBy === g} onClick={() => setGroupBy(g)} />
        ))}

        <div className="relative ml-auto" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 h-8 px-3 text-xs font-medium border rounded-md hover:bg-muted",
              isFiltered && "border-primary text-primary bg-primary-soft",
            )}
          >
            <Search className="h-3.5 w-3.5" />
            {isFiltered ? `${selected.length} sản phẩm đã chọn` : "Lọc theo sản phẩm"}
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
                {pickerLoading ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">Đang tải…</p>
                ) : pickerHits.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">Không tìm thấy</p>
                ) : (
                  pickerHits.map((p) => {
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

      {isFiltered && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => {
            const fromPicker = pickerHits.find((x) => x.id === id);
            const fromBackend = backendProductRows.find((r) => String(r.productId ?? r.id) === id);
            const p =
              fromPicker ??
              (fromBackend
                ? {
                    id,
                    name: String(fromBackend.productName ?? fromBackend.name ?? id),
                    code: String(fromBackend.productCode ?? ""),
                  }
                : null);
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

      {!isFiltered && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm mb-1">Kỳ đang chọn</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Doanh thu</span>
                <span className="font-medium">{formatVND(headerRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lợi nhuận</span>
                <span className="font-medium text-success">{formatVND(headerProfit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Biên lợi nhuận</span>
                <span className="font-medium">{formatPercent(headerMarginFraction)}</span>
              </div>
            </div>
          </div>
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm mb-1">Nguồn dữ liệu</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng hợp kỳ</span>
                <span className="font-medium text-right">Dữ liệu máy chủ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chi tiết theo SP</span>
                <span className="font-medium text-right">Dữ liệu máy chủ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sản phẩm (catalog)</span>
                <span className="font-medium">{new Set(backendProductRows.map((r) => String(r.productId ?? r.id))).size}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card rounded-lg border p-4">
        <h3 className="font-semibold text-sm mb-3">Lợi nhuận theo {profitGroupLabel[groupBy].toLowerCase()}</h3>
        <ChartContainer
          config={{
            revenue: { label: "Doanh thu", color: "hsl(var(--primary))" },
            profit: { label: "Lợi nhuận", color: "hsl(var(--success))" },
          }}
          className="h-72 w-full"
        >
          <AreaChart data={profitSeries} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="profRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="profProf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as typeof profitSeries[number];
                return (
                  <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                    <p className="font-semibold">{label}</p>
                    <p>Doanh thu: <b>{formatVND(row.revenue)}</b></p>
                    <p>Giá vốn: <b>{formatVND(row.cost)}</b></p>
                    <p>Lợi nhuận: <b>{formatVND(row.profit)}</b></p>
                    <p>Biên LN: <b>{formatPercent((row.margin ?? 0) / 100)}</b></p>
                  </div>
                );
              }}
            />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#profRev)" name="Doanh thu" activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} />
            <Area type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2.5} fill="url(#profProf)" name="Lợi Nhuận" activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }} />
          </AreaChart>
        </ChartContainer>
      </div>

      <div className="bg-card rounded-lg border p-4">
        <h3 className="font-semibold text-sm mb-3">
          {isFiltered ? "Lợi nhuận theo sản phẩm đã chọn" : "Lợi nhuận theo sản phẩm (top 8 backend)"}
        </h3>
        <div className="space-y-2">
          {(isFiltered ? filteredDetailRows.filter((r) => !r.missing) : chartRows).slice(0, 8).map((r) => {
            const rev = r.revenue ?? 0;
            const prof = r.profit ?? 0;
            const marginFrac = r.margin != null ? r.margin : rev > 0 ? prof / rev : 0;
            const maxRev = Math.max(
              ...(isFiltered
                ? filteredDetailRows.filter((x) => !x.missing).map((x) => x.revenue ?? 0)
                : chartRows.map((x) => x.revenue)),
              1,
            );
            const revPct = (rev / maxRev) * 100;
            const profitPct = (prof / maxRev) * 100;
            return (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="text-success font-medium">
                    {money(prof)} · {formatPercent(marginFrac)}
                  </span>
                </div>
                <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-muted-foreground/30" style={{ width: `${revPct}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-success" style={{ width: `${profitPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">{isFiltered ? "Chi tiết sản phẩm đã chọn" : "Tổng hợp kỳ"}</h3>
        </div>
        {isFiltered ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sản phẩm</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">SL bán</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Doanh thu</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giá vốn</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Lợi nhuận</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Biên LN</th>
              </tr>
            </thead>
            <tbody>
              {filteredDetailRows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right">{r.qty != null ? formatNumber(r.qty) : "—"}</td>
                  <td className="px-3 py-2.5 text-right">{money(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{money(r.cost)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-success">{money(r.profit)}</td>
                  <td className="px-3 py-2.5 text-right">{pct(r.margin)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-bold">
                <td className="px-3 py-2">Tổng (hàng có dữ liệu)</td>
                <td className="px-3 py-2 text-right">{formatNumber(footerFiltered.q)}</td>
                <td className="px-3 py-2 text-right">{formatVND(footerFiltered.rev)}</td>
                <td className="px-3 py-2 text-right">{formatVND(footerFiltered.cst)}</td>
                <td className="px-3 py-2 text-right text-success">{formatVND(footerFiltered.prof)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(footerFiltered.margin)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Kỳ</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Doanh thu</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giá vốn</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Lợi nhuận</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Biên LN</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground">Hóa đơn</th>
              </tr>
            </thead>
            <tbody>
              {(reportData?.profitRows ?? []).map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{row.period}</td>
                  <td className="px-3 py-2.5 text-right">{formatVND(row.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{formatVND(row.cost)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-success">{formatVND(row.profit)}</td>
                  <td className="px-3 py-2.5 text-right">{formatPercent((row.margin ?? 0) / 100)}</td>
                  <td className="px-3 py-2.5 text-center">{row.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
