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
import { TablePagination } from "@/components/shared/TablePagination";

type SortKey = "code" | "product" | "category" | "opening" | "received" | "sold" | "adjusted" | "closing" | "value";

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

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

  const isFiltered = search.trim() !== "" || category !== "all";
  // Tổng tính trên TOÀN BỘ dataset đã lọc (không phụ thuộc trang hiện tại)
  const totalClosingValue = filtered.reduce((s, r) => s + r.closingValue, 0);
  const totalClosingStock = filtered.reduce((s, r) => s + r.closingStock, 0);
  const lowStockCount = filtered.filter(r => r.closingStock > 0 && r.closingStock < 15).length;
  const outOfStockCount = filtered.filter(r => r.closingStock === 0).length;

  // Tổng theo trang đang hiển thị
  const pageClosingStock = tc.pageRows.reduce((s, r) => s + r.closingStock, 0);
  const pageClosingValue = tc.pageRows.reduce((s, r) => s + r.closingValue, 0);

  const isPaginated = tc.total > tc.pageSize;

  const handleExportExcel = async () => {
    try {
      setExcelBusy(true);
      const sortSpec =
          tc.sort.key != null ? `${tc.sort.key}:${tc.sort.dir}` : undefined;
      await adminReports.downloadInventoryExcel(from, to, {
        keyword: search.trim() || undefined,
        categoryName: category !== "all" ? category : undefined,
        sort: sortSpec,
      });
      toast.success("Đã tải file Excel báo cáo tồn kho");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không xuất Excel được");
    } finally {
      setExcelBusy(false);
    }
  };

  const suffix = isFiltered ? " theo bộ lọc" : " toàn bộ";

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
                  title="Xuất dữ liệu theo bộ lọc đang chọn."
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> {excelBusy ? "Đang xuất..." : "Xuất Excel"}
              </button>
            }
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={Package} title={`Tổng tồn kho${suffix}`} value={formatNumber(totalClosingStock)} subtitle="đơn vị" />
          <StatCard icon={BarChart3} title={`Giá trị tồn kho${suffix}`} value={formatVND(totalClosingValue)} variant="primary" />
          <StatCard icon={AlertTriangle} title={`Sắp hết hàng${suffix}`} value={`${lowStockCount}`} variant="warning" subtitle="phân loại" />
          <StatCard icon={Package} title={`Hết hàng${suffix}`} value={`${outOfStockCount}`} variant="danger" subtitle="phân loại" />
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Số liệu phía trên tính trên toàn bộ {formatNumber(tc.total)} phân loại{isFiltered ? " theo bộ lọc" : ""}, không phụ thuộc trang đang hiển thị.
        </p>

        <DataTableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm sản phẩm, mã phân loại..."
            actions={
              <div className="flex flex-wrap gap-2">
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-8 px-2 text-xs border rounded-md bg-background"
                    title="“Tất cả danh mục” chỉ nghĩa là không lọc theo danh mục — bảng vẫn phân trang."
                >
                  <option value="all">Tất cả danh mục</option>
                  {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <DateInput value={from} onChange={setFrom} />
                <span className="text-xs text-muted-foreground self-center">-</span>
                <DateInput value={to} onChange={setTo} />
              </div>
            }
        />

        {isFiltered && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {category !== "all" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-soft text-primary border border-primary/20">
              Danh mục: {category}
            </span>
              )}
              {search.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border">
              Từ khóa: "{search.trim()}"
            </span>
              )}
              <button
                  type="button"
                  onClick={() => { setSearch(""); setCategory("all"); }}
                  className="text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Xóa lọc
              </button>
            </div>
        )}

        {/* Dòng mô tả nhắc admin: tổng tính trên full filtered, không phải page hiện tại */}
        {tc.total > 0 && (
            <p className="text-[11px] text-muted-foreground break-words">
              Đang hiển thị <span className="font-medium text-foreground">{formatNumber(tc.rangeStart)}-{formatNumber(tc.rangeEnd)}</span> / <span className="font-medium text-foreground">{formatNumber(tc.total)}</span> phân loại. Tổng số liệu bên trên tính trên toàn bộ {formatNumber(tc.total)} phân loại{isFiltered ? " theo bộ lọc" : ""}.
            </p>
        )}

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
              <SortableTh label="Đầu kỳ" sortKey="opening" sort={tc.sort} onSort={tc.toggleSort} className="text-right" />
              <SortableTh label="Nhập" sortKey="received" sort={tc.sort} onSort={tc.toggleSort} className="text-right" />
              <SortableTh label="Bán" sortKey="sold" sort={tc.sort} onSort={tc.toggleSort} className="text-right" />
              <SortableTh label="Đ.chỉnh" sortKey="adjusted" sort={tc.sort} onSort={tc.toggleSort} className="text-right" />
              <SortableTh label="Cuối kỳ" sortKey="closing" sort={tc.sort} onSort={tc.toggleSort} className="text-right" />
              <SortableTh label="Giá trị" sortKey="value" sort={tc.sort} onSort={tc.toggleSort} className="text-right" />
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
            {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-medium">Không có phân loại phù hợp bộ lọc.</p>
                    <p className="text-xs text-muted-foreground mt-1">Thử đổi danh mục, thời gian hoặc từ khóa tìm kiếm.</p>
                    {isFiltered && (
                        <button
                            type="button"
                            onClick={() => { setSearch(""); setCategory("all"); }}
                            className="mt-3 inline-flex items-center px-3 h-8 text-xs font-medium border rounded-md hover:bg-muted"
                        >
                          Xóa bộ lọc
                        </button>
                    )}
                  </td>
                </tr>
            )}
            </tbody>
            <tfoot>
            {isPaginated ? (
                <>
                  <tr className="bg-muted/30 font-medium">
                    <td colSpan={8} className="px-3 py-2 text-right text-xs text-muted-foreground">
                      Tổng trang hiện tại ({formatNumber(tc.rangeStart)}-{formatNumber(tc.rangeEnd)})
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(pageClosingStock)}</td>
                    <td className="px-3 py-2 text-right">{formatVND(pageClosingValue)}</td>
                  </tr>
                  <tr className="bg-muted/50 font-bold">
                    <td colSpan={8} className="px-3 py-2 text-right">
                      {isFiltered ? "Tổng theo bộ lọc" : "Tổng toàn bộ"} ({formatNumber(tc.total)} phân loại)
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(totalClosingStock)}</td>
                    <td className="px-3 py-2 text-right">{formatVND(totalClosingValue)}</td>
                  </tr>
                </>
            ) : (
                <tr className="bg-muted/50 font-bold">
                  <td colSpan={8} className="px-3 py-2 text-right">{isFiltered ? "Tổng theo bộ lọc" : "Tổng"}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(totalClosingStock)}</td>
                  <td className="px-3 py-2 text-right">{formatVND(totalClosingValue)}</td>
                </tr>
            )}
            </tfoot>
          </table>
        </div>

        {tc.total > 0 && (
            <TablePagination
                page={tc.page}
                totalPages={tc.totalPages}
                total={tc.total}
                rangeStart={tc.rangeStart}
                rangeEnd={tc.rangeEnd}
                pageSize={tc.pageSize}
                onPageChange={tc.setPage}
                onPageSizeChange={tc.setPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
        )}
      </div>
  );
}