import { useMemo, useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DateInput } from "@/components/shared/DateInput";
import { profitData, dashboardStats, revenueByProduct } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { formatVND, formatPercent, formatNumber } from "@/lib/format";
import { DollarSign, TrendingUp, Download, Receipt, Search, X, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminProfitReport() {
  const { products } = useStore();
  const [from, setFrom] = useState("2025-04-07");
  const [to, setTo] = useState("2025-04-15");
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

  // Build deterministic per-product profit rows from existing mock revenueByProduct
  // so the multi-select filter visibly drives summary + table + chart.
  const productProfitRows = useMemo(() => {
    return products.map(p => {
      const sample = revenueByProduct.find(r => r.name.toLowerCase().includes(p.name.toLowerCase()));
      const revenue = sample?.revenue ?? Math.round(2000000 + p.id.charCodeAt(0) * 9000);
      const qty = sample?.qty ?? Math.round(40 + (p.id.charCodeAt(0) % 7) * 25);
      const cost = Math.round(revenue * 0.72);
      return { id: p.id, name: p.name, revenue, cost, profit: revenue - cost, qty, margin: (revenue - cost) / revenue };
    });
  }, [products]);

  const filteredRows = useMemo(() => {
    if (selected.length === 0) return productProfitRows;
    return productProfitRows.filter(r => selected.includes(r.id));
  }, [productProfitRows, selected]);

  const totalRevenue = filteredRows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = filteredRows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;
  const totalQty = filteredRows.reduce((s, r) => s + r.qty, 0);
  const isFiltered = selected.length > 0;

  const pickerProducts = products.filter(p => !pickerSearch || p.name.toLowerCase().includes(pickerSearch.toLowerCase()));
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Lợi nhuận"
        description={isFiltered ? `Đang phân tích ${selected.length} sản phẩm` : "Báo cáo lợi nhuận kinh doanh"}
        actions={<button onClick={() => toast.success("Đã xuất báo cáo Excel")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted"><Download className="h-3.5 w-3.5" /> Xuất Excel</button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={TrendingUp} title="Doanh thu" value={formatVND(totalRevenue)} variant="primary" />
        <StatCard icon={DollarSign} title="Giá vốn" value={formatVND(totalCost)} />
        <StatCard icon={DollarSign} title="Lợi nhuận" value={formatVND(totalProfit)} variant="success" trend={{ value: formatPercent(margin), positive: totalProfit > 0 }} />
        <StatCard icon={Receipt} title="SL bán" value={formatNumber(totalQty)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <DateInput value={from} onChange={setFrom} />
        <span className="text-xs text-muted-foreground">—</span>
        <DateInput value={to} onChange={setTo} />

        <div className="relative ml-auto" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            className={cn("flex items-center gap-1.5 h-8 px-3 text-xs font-medium border rounded-md hover:bg-muted", isFiltered && "border-primary text-primary bg-primary-soft")}
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
                    autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Tìm sản phẩm..."
                    className="w-full h-8 pl-8 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto scrollbar-thin">
                {pickerProducts.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">Không tìm thấy</p>
                ) : pickerProducts.map(p => {
                  const checked = selected.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => toggle(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted text-left">
                      <span className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0", checked ? "bg-primary border-primary" : "border-input")}>
                        {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{p.code}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 p-2 border-t bg-muted/30">
                <button onClick={() => setSelected([])} className="text-[11px] text-muted-foreground hover:text-foreground">Xóa lọc</button>
                <button onClick={() => setPickerOpen(false)} className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded-md">Xong</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isFiltered && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(id => {
            const p = products.find(x => x.id === id);
            if (!p) return null;
            return (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-primary-soft text-primary rounded-full">
                {p.name}
                <button onClick={() => toggle(id)} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            );
          })}
        </div>
      )}

      {/* Quick stats — only show period summary when no filter applied */}
      {!isFiltered && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm mb-1">Tuần này</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Doanh thu</span><span className="font-medium">{formatVND(dashboardStats.revenueThisWeek)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lợi nhuận</span><span className="font-medium text-success">{formatVND(dashboardStats.profitThisWeek)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Biên lợi nhuận</span><span className="font-medium">{formatPercent(dashboardStats.profitThisWeek / dashboardStats.revenueThisWeek)}</span></div>
            </div>
          </div>
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm mb-1">Tháng này</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Doanh thu</span><span className="font-medium">{formatVND(dashboardStats.revenueThisMonth)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Lợi nhuận</span><span className="font-medium text-success">{formatVND(dashboardStats.profitThisMonth)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Biên lợi nhuận</span><span className="font-medium">{formatPercent(dashboardStats.profitThisMonth / dashboardStats.revenueThisMonth)}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Chart: profit per product (bar) */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="font-semibold text-sm mb-3">{isFiltered ? "Lợi nhuận theo sản phẩm đã chọn" : "Lợi nhuận theo sản phẩm"}</h3>
        <div className="space-y-2">
          {filteredRows.slice(0, 8).map((r) => {
            const maxRev = Math.max(...filteredRows.map(x => x.revenue), 1);
            const revPct = (r.revenue / maxRev) * 100;
            const profitPct = (r.profit / maxRev) * 100;
            return (
              <div key={r.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{r.name}</span>
                  <span className="text-success font-medium">{formatVND(r.profit)} · {formatPercent(r.margin)}</span>
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

      {/* Detail table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm">{isFiltered ? "Chi tiết sản phẩm đã chọn" : "Chi tiết theo kỳ"}</h3></div>
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
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(r.qty)}</td>
                  <td className="px-3 py-2.5 text-right">{formatVND(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{formatVND(r.cost)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-success">{formatVND(r.profit)}</td>
                  <td className="px-3 py-2.5 text-right">{formatPercent(r.margin)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-bold">
                <td className="px-3 py-2">Tổng</td>
                <td className="px-3 py-2 text-right">{formatNumber(totalQty)}</td>
                <td className="px-3 py-2 text-right">{formatVND(totalRevenue)}</td>
                <td className="px-3 py-2 text-right">{formatVND(totalCost)}</td>
                <td className="px-3 py-2 text-right text-success">{formatVND(totalProfit)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(margin)}</td>
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
              {profitData.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium">{r.period}</td>
                  <td className="px-3 py-2.5 text-right">{formatVND(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-right text-muted-foreground">{formatVND(r.cost)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-success">{formatVND(r.profit)}</td>
                  <td className="px-3 py-2.5 text-right">{formatPercent(r.margin)}</td>
                  <td className="px-3 py-2.5 text-center">{r.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
