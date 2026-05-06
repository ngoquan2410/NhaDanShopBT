import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { DateInput } from "@/components/shared/DateInput";
import { useService } from "@/hooks/useService";
import { adminReports } from "@/services";
import { formatVND, formatNumber } from "@/lib/format";
import { BarChart3, Download, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SortableTh } from "@/components/shared/SortableTh";
import { useTableControls } from "@/hooks/useTableControls";

type SortKey = "code" | "product" | "category" | "opening" | "received" | "sold" | "adjusted" | "closing" | "value";

export default function AdminInventoryReport() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("2026-04-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [excelBusy, setExcelBusy] = useState(false);
  const { data, loading, error } = useService(() => adminReports.inventory(from, to), [from, to]);
  const inventoryReport = data ?? [];
  const categoryOptions = useMemo(
    () => Array.from(new Set(inventoryReport.map((r) => r.categoryName || "Không phân loại"))).sort((a, b) => a.localeCompare(b)),
    [inventoryReport],
  );
  const filtered = inventoryReport.filter(r => {
    const q = search.trim().toLowerCase();
    if (category !== "all" && (r.categoryName || "Không phân loại") !== category) return false;
    return !q || r.productName.toLowerCase().includes(q) || r.variantName.toLowerCase().includes(q) || r.variantCode.toLowerCase().includes(q) || String(r.categoryName ?? "").toLowerCase().includes(q);
  });
  const tc = useTableControls<typeof inventoryReport[number], SortKey>({
    data: filtered,
    pageSize: 100,
    initialSort: { key: "product", dir: "asc" },
    sortAccessors: {
      code: (r) => r.variantCode,
      product: (r) => `${r.productName} ${r.variantName}`,
      category: (r) => r.categoryName ?? "",
      opening: (r) => r.openingStock,
      received: (r) => r.received,
      sold: (r) => r.sold,
      adjusted: (r) => r.adjusted,
      closing: (r) => r.closingStock,
      value: (r) => r.closingValue,
    },
    resetToken: `${search}|${category}|${from}|${to}`,
  });

  const totalClosingValue = inventoryReport.reduce((s, r) => s + r.closingValue, 0);
  const totalClosingStock = inventoryReport.reduce((s, r) => s + r.closingStock, 0);
  const lowStockCount = inventoryReport.filter(r => r.closingStock > 0 && r.closingStock < 15).length;

  const handleExportExcel = async () => {
    try {
      setExcelBusy(true);
      await adminReports.downloadInventoryExcel(from, to);
      toast.success("Đã tải file Excel báo cáo tồn kho");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xuất Excel được");
    } finally {
      setExcelBusy(false);
    }
  };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Báo cáo tồn kho"
        description="Tổng quan tồn kho theo phân loại"
        actions={
          <button
            type="button"
            data-testid="inventory-report-export-excel"
            disabled={excelBusy}
            onClick={() => void handleExportExcel()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {excelBusy ? "Đang xuất..." : "Xuất Excel"}
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Package} title="Tổng tồn kho" value={formatNumber(totalClosingStock)} subtitle="đơn vị" />
        <StatCard icon={BarChart3} title="Giá trị tồn kho" value={formatVND(totalClosingValue)} variant="primary" />
        <StatCard icon={AlertTriangle} title="Sắp hết hàng" value={`${lowStockCount}`} variant="warning" subtitle="phân loại" />
        <StatCard icon={Package} title="Hết hàng" value={`${inventoryReport.filter(r => r.closingStock === 0).length}`} variant="danger" subtitle="phân loại" />
      </div>

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm sản phẩm, mã phân loại..."
        actions={
          <div className="flex gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 px-2 text-xs border rounded-md bg-background">
              <option value="all">Tất cả danh mục</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <DateInput value={from} onChange={setFrom} />
            <span className="text-xs text-muted-foreground self-center">-</span>
            <DateInput value={to} onChange={setTo} />
          </div>
        }
      />

      {loading && <p className="text-sm text-muted-foreground">Đang tải báo cáo tồn kho từ backend...</p>}
      {error && <p className="text-sm text-danger">Không tải được báo cáo tồn kho: {error.message}</p>}

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortableTh label="Mã" sortKey="code" sort={tc.sort} onSort={tc.toggleSort} />
              <SortableTh label="Sản phẩm" sortKey="product" sort={tc.sort} onSort={tc.toggleSort} />
              <SortableTh label="Danh mục" sortKey="category" sort={tc.sort} onSort={tc.toggleSort} />
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">Đơn vị</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Đầu kỳ</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground text-success">Nhập</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground text-primary">Bán</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Đ.chỉnh</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cuối kỳ</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {tc.pageRows.map(r => (
              <tr key={r.variantCode} className={cn("border-b last:border-0 hover:bg-muted/30", r.closingStock === 0 && "bg-danger-soft/30")}>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.variantCode}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-xs">{r.productName}</p>
                  <p className="text-[11px] text-muted-foreground">{r.variantName}</p>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.categoryName || "Không phân loại"}</td>
                <td className="px-3 py-2 text-center text-xs text-muted-foreground">{r.unit}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.openingStock)}</td>
                <td className="px-3 py-2 text-right text-success font-medium">+{formatNumber(r.received)}</td>
                <td className="px-3 py-2 text-right text-primary font-medium">-{formatNumber(r.sold)}</td>
                <td className="px-3 py-2 text-right">{r.adjusted !== 0 ? <span className={r.adjusted > 0 ? 'text-success' : 'text-danger'}>{r.adjusted > 0 ? '+' : ''}{r.adjusted}</span> : '-'}</td>
                <td className="px-3 py-2 text-right font-bold">{formatNumber(r.closingStock)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{formatVND(r.closingValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-bold">
              <td colSpan={8} className="px-3 py-2 text-right">Tổng</td>
              <td className="px-3 py-2 text-right">{formatNumber(totalClosingStock)}</td>
              <td className="px-3 py-2 text-right">{formatVND(totalClosingValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
