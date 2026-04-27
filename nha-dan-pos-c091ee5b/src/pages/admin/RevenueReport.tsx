import { useMemo, useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { FilterChip } from "@/components/shared/DataTableToolbar";
import { DateInput } from "@/components/shared/DateInput";
import { revenueData, revenueByProduct, revenueByCategory } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { formatVND, formatNumber } from "@/lib/format";
import { TrendingUp, Download, ShoppingCart, BarChart3, Search, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Group = "daily" | "weekly" | "monthly" | "yearly";

function aggregate(group: Group) {
  const sorted = [...revenueData].slice().reverse();
  if (group === "daily") {
    return sorted.map(r => ({ period: r.period, revenue: r.revenue, invoiceCount: r.invoiceCount, itemsSold: r.itemsSold }));
  }
  if (group === "weekly") {
    const bucket = sorted.reduce((acc, r) => { acc.revenue += r.revenue; acc.invoiceCount += r.invoiceCount; acc.itemsSold += r.itemsSold; return acc; }, { revenue: 0, invoiceCount: 0, itemsSold: 0 });
    return [{ period: "Tuần này (09–15/04)", ...bucket }];
  }
  if (group === "monthly") {
    const total = sorted.reduce((acc, r) => { acc.revenue += r.revenue; acc.invoiceCount += r.invoiceCount; acc.itemsSold += r.itemsSold; return acc; }, { revenue: 0, invoiceCount: 0, itemsSold: 0 });
    return [
      { period: "Tháng 03/2025", revenue: Math.round(total.revenue * 4.2), invoiceCount: Math.round(total.invoiceCount * 4.2), itemsSold: Math.round(total.itemsSold * 4.2) },
      { period: "Tháng 04/2025", ...total },
    ];
  }
  return [
    { period: "2024", revenue: 285000000, invoiceCount: 1820, itemsSold: 9450 },
    { period: "2025 (đến nay)", revenue: 78400000, invoiceCount: 540, itemsSold: 2780 },
  ];
}

const groupLabel: Record<Group, string> = { daily: "Ngày", weekly: "Tuần", monthly: "Tháng", yearly: "Năm" };

export default function AdminRevenueReport() {
  const { products } = useStore();
  const [groupBy, setGroupBy] = useState<Group>("daily");
  const [from, setFrom] = useState("2025-04-09");
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

  const productRevenueRows = useMemo(() => {
    return products.map(p => {
      const sample = revenueByProduct.find(r => r.name.toLowerCase().includes(p.name.toLowerCase()));
      const revenue = sample?.revenue ?? Math.round(2000000 + p.id.charCodeAt(0) * 9000);
      const qty = sample?.qty ?? Math.round(40 + (p.id.charCodeAt(0) % 7) * 25);
      return { id: p.id, name: p.name, code: p.code, revenue, qty };
    });
  }, [products]);

  const filteredProductRows = useMemo(() => {
    if (selected.length === 0) return productRevenueRows;
    return productRevenueRows.filter(r => selected.includes(r.id));
  }, [productRevenueRows, selected]);

  const isFiltered = selected.length > 0;
  const allRows = useMemo(() => aggregate(groupBy), [groupBy]);

  // When filtered, scale aggregate proportionally to selected products' share of total revenue
  const scale = useMemo(() => {
    if (!isFiltered) return 1;
    const totalAll = productRevenueRows.reduce((s, r) => s + r.revenue, 0) || 1;
    const totalSel = filteredProductRows.reduce((s, r) => s + r.revenue, 0);
    return totalSel / totalAll;
  }, [isFiltered, productRevenueRows, filteredProductRows]);

  const rows = useMemo(() => allRows.map(r => ({
    period: r.period,
    revenue: Math.round(r.revenue * scale),
    invoiceCount: Math.round(r.invoiceCount * scale),
    itemsSold: Math.round(r.itemsSold * scale),
  })), [allRows, scale]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalInvoices = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const totalItems = rows.reduce((s, r) => s + r.itemsSold, 0);

  const pickerProducts = products.filter(p => !pickerSearch || p.name.toLowerCase().includes(pickerSearch.toLowerCase()));
  const toggle = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Doanh thu"
        description={isFiltered ? `Đang phân tích ${selected.length} sản phẩm — nhóm theo ${groupLabel[groupBy].toLowerCase()}` : `Báo cáo doanh thu — nhóm theo ${groupLabel[groupBy].toLowerCase()}`}
        actions={<button onClick={() => toast.success("Đã xuất báo cáo Excel")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted"><Download className="h-3.5 w-3.5" /> Xuất Excel</button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={TrendingUp} title="Tổng doanh thu" value={formatVND(totalRevenue)} variant="primary" />
        <StatCard icon={ShoppingCart} title="Hóa đơn" value={formatNumber(totalInvoices)} />
        <StatCard icon={BarChart3} title="SP đã bán" value={formatNumber(totalItems)} variant="success" />
        <StatCard icon={TrendingUp} title="TB/hóa đơn" value={totalInvoices ? formatVND(Math.round(totalRevenue / totalInvoices)) : "—"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Nhóm theo:</span>
        {(["daily", "weekly", "monthly", "yearly"] as Group[]).map(g => (
          <FilterChip key={g} label={groupLabel[g]} active={groupBy === g} onClick={() => setGroupBy(g)} />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <DateInput value={from} onChange={setFrom} />
          <span className="text-xs text-muted-foreground">—</span>
          <DateInput value={to} onChange={setTo} />

          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen(o => !o)}
              className={cn("flex items-center gap-1.5 h-8 px-3 text-xs font-medium border rounded-md hover:bg-muted", isFiltered && "border-primary text-primary bg-primary-soft")}
            >
              <Search className="h-3.5 w-3.5" />
              {isFiltered ? `${selected.length} sản phẩm` : "Lọc theo sản phẩm"}
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-popover border rounded-md shadow-lg z-30 animate-fade-in">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input autoFocus value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Tìm sản phẩm..." className="w-full h-8 pl-8 pr-2 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-card rounded-lg border p-4">
          <h3 className="font-semibold text-sm mb-3">Doanh thu theo {groupLabel[groupBy].toLowerCase()}</h3>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const maxRev = Math.max(...rows.map(x => x.revenue), 1);
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
          <div className="space-y-2">
            {(isFiltered ? filteredProductRows.map(r => ({ name: r.name, revenue: r.revenue })) : revenueByCategory).map((r, i) => {
              const list = isFiltered ? filteredProductRows : revenueByCategory;
              const maxRev = Math.max(...list.map(x => x.revenue), 1);
              const pct = (r.revenue / maxRev) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-32 shrink-0 truncate">{r.name}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${pct}%` }} />
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
                <td className="px-3 py-2.5 text-right text-muted-foreground">{r.invoiceCount ? formatVND(Math.round(r.revenue / r.invoiceCount)) : "—"}</td>
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
        <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm">{isFiltered ? "Sản phẩm đã chọn" : "Sản phẩm bán chạy"}</h3></div>
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
            {(isFiltered ? filteredProductRows : revenueByProduct.map((r, i) => ({ id: String(i), name: r.name, qty: r.qty, revenue: r.revenue }))).map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
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
