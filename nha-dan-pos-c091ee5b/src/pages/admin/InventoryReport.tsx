import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { DateInput } from "@/components/shared/DateInput";
import { inventoryReport } from "@/lib/mock-data";
import { formatVND, formatNumber } from "@/lib/format";
import { BarChart3, Download, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminInventoryReport() {
  const [search, setSearch] = useState('');
  const filtered = inventoryReport.filter(r =>
    !search || r.productName.toLowerCase().includes(search.toLowerCase()) || r.variantCode.toLowerCase().includes(search.toLowerCase())
  );

  const totalClosingValue = inventoryReport.reduce((s, r) => s + r.closingValue, 0);
  const totalClosingStock = inventoryReport.reduce((s, r) => s + r.closingStock, 0);
  const lowStockCount = inventoryReport.filter(r => r.closingStock > 0 && r.closingStock < 15).length;

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Báo cáo tồn kho"
        description="Tổng quan tồn kho theo phân loại"
        actions={<button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted"><Download className="h-3.5 w-3.5" /> Xuất Excel</button>}
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
            <DateInput defaultValue="2025-04-01" />
            <span className="text-xs text-muted-foreground self-center">—</span>
            <DateInput defaultValue="2025-04-15" />
          </div>
        }
      />

      <div className="bg-card rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mã</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sản phẩm</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground">ĐV</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Đầu kỳ</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground text-success">Nhập</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground text-primary">Bán</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Đ.chỉnh</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cuối kỳ</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.variantCode} className={cn("border-b last:border-0 hover:bg-muted/30", r.closingStock === 0 && "bg-danger-soft/30")}>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.variantCode}</td>
                <td className="px-3 py-2">
                  <p className="font-medium text-xs">{r.productName}</p>
                  <p className="text-[11px] text-muted-foreground">{r.variantName}</p>
                </td>
                <td className="px-3 py-2 text-center text-xs text-muted-foreground">{r.unit}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.openingStock)}</td>
                <td className="px-3 py-2 text-right text-success font-medium">+{formatNumber(r.received)}</td>
                <td className="px-3 py-2 text-right text-primary font-medium">-{formatNumber(r.sold)}</td>
                <td className="px-3 py-2 text-right">{r.adjusted !== 0 ? <span className={r.adjusted > 0 ? 'text-success' : 'text-danger'}>{r.adjusted > 0 ? '+' : ''}{r.adjusted}</span> : '—'}</td>
                <td className="px-3 py-2 text-right font-bold">{formatNumber(r.closingStock)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{formatVND(r.closingValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-bold">
              <td colSpan={7} className="px-3 py-2 text-right">Tổng</td>
              <td className="px-3 py-2 text-right">{formatNumber(totalClosingStock)}</td>
              <td className="px-3 py-2 text-right">{formatVND(totalClosingValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
