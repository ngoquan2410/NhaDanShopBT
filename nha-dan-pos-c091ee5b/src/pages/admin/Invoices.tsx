import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar, FilterChip } from "@/components/shared/DataTableToolbar";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { AsyncBoundary } from "@/components/shared/AsyncBoundary";
import { InvoiceDetailDrawer } from "@/components/shared/InvoiceDetailDrawer";
import { TablePagination } from "@/components/shared/TablePagination";
import { SortableTh } from "@/components/shared/SortableTh";
import { PeriodFilter, matchesPeriod, type PeriodValue } from "@/components/shared/PeriodFilter";
import { invoices as invoiceService } from "@/services";
import { useService } from "@/hooks/useService";
import type { Invoice } from "@/lib/mock-data";
import { formatVND, formatDateTime } from "@/lib/format";
import { useTableControls } from "@/hooks/useTableControls";
import { Receipt, Printer, XCircle, Trash2, Eye, ShieldAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Merchandise-oriented profit from backend when present (`itemGrossProfit` preferred). */
function displayMerchProfit(inv: Invoice): number | null {
  if (inv.status === "cancelled") return null;
  const raw = inv.itemGrossProfit ?? inv.totalProfit;
  if (raw == null || Number.isNaN(raw)) return null;
  return Math.round(Number(raw));
}

function canPhysicallyDeleteInvoice(inv: Invoice): boolean {
  if (inv.allowPhysicalDelete === false) return false;
  if (inv.allowPhysicalDelete === true) return true;
  const day = new Date().toISOString().slice(0, 10);
  return inv.date.startsWith(day);
}

type SortKey = "number" | "date" | "customer" | "total" | "profit" | "status";

export default function AdminInvoices() {
  const initialQ = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') ?? '' : '';
  const [search, setSearch] = useState(initialQ);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodValue>({ preset: "all" });
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

  // Real async load via the canonical InvoiceService. We pass the BE-friendly
  // `status` filter; period + free-text search remain client-side because the
  // local adapter already filters on date/query, but we keep the UI-side
  // filters too so behaviour is identical when the BE adapter takes over.
  const { data, loading, error, isEmpty, reload } = useService(
    () =>
      invoiceService.list({
        status: filterStatus === 'active' || filterStatus === 'cancelled' ? filterStatus : undefined,
        sort: [{ field: "date", direction: "desc" }],
      }),
    [filterStatus],
  );

  const invoiceList: Invoice[] = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => invoiceList.filter(inv => {
    if (search && !inv.number.toLowerCase().includes(search.toLowerCase()) && !inv.customerName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && inv.status !== filterStatus) return false;
    if (!matchesPeriod(inv.date, period)) return false;
    return true;
  }), [invoiceList, search, filterStatus, period]);

  const tc = useTableControls<Invoice, SortKey>({
    data: filtered,
    pageSize: 20,
    initialSort: { key: "date", dir: "desc" },
      sortAccessors: {
      number: (i) => i.number,
      date: (i) => new Date(i.date),
      customer: (i) => i.customerName,
      total: (i) => i.total,
      profit: (i) => displayMerchProfit(i) ?? -1,
      status: (i) => i.status,
    },
    resetToken: `${search}|${filterStatus}|${period.preset}|${period.from}|${period.to}`,
  });

  const knownProfits = filtered.map(displayMerchProfit).filter((p): p is number => p != null);
  const totalProfitDisplay = knownProfits.length > 0 ? knownProfits.reduce((a, b) => a + b, 0) : null;

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const inv = invoiceList.find(i => i.id === cancelTarget);
    try {
      await invoiceService.cancel(cancelTarget);
      reload();
      toast.success(`Đã hủy hóa đơn ${inv?.number ?? ''}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không thể hủy hóa đơn");
    }
    setCancelTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const inv = invoiceList.find(i => i.id === deleteTarget);
    try {
      await invoiceService.remove(deleteTarget);
      reload();
      toast.success(`Đã xóa hóa đơn ${inv?.number ?? ''}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Không thể xóa hóa đơn");
    }
    setDeleteTarget(null);
  };

  const handlePrint = (inv: Invoice) => setDetailInvoice(inv);

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Hóa đơn"
        description={`${data?.total ?? invoiceList.length} hóa đơn`}
        actions={
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-success-soft text-success rounded-md">
            <TrendingUp className="h-3.5 w-3.5" />
            Lợi nhuận (hàng hóa, từ máy chủ khi có):{" "}
            <strong>{totalProfitDisplay != null ? formatVND(totalProfitDisplay) : "—"}</strong>
          </div>
        }
      />

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm số hóa đơn, khách hàng..."
        filters={<>
          <FilterChip label="Tất cả" active={!filterStatus} onClick={() => setFilterStatus(null)} />
          <FilterChip label="Hoạt động" active={filterStatus === 'active'} onClick={() => setFilterStatus('active')} />
          <FilterChip label="Đã hủy" active={filterStatus === 'cancelled'} onClick={() => setFilterStatus('cancelled')} />
        </>}
      />

      <PeriodFilter value={period} onChange={setPeriod} />

      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={!loading && !error && filtered.length === 0}
        data={tc.pageRows}
        onRetry={reload}
        emptyFallback={<EmptyState icon={Receipt} title="Không tìm thấy hóa đơn" />}
      >
        {(rows) => (
          <>
          <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <SortableTh label="Số hóa đơn" sortKey="number" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Thời gian" sortKey="date" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Khách hàng" sortKey="customer" sort={tc.sort} onSort={tc.toggleSort} />
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Thanh toán</th>
                  <SortableTh label="Tổng" sortKey="total" sort={tc.sort} onSort={tc.toggleSort} align="right" />
                  <SortableTh label="Lợi nhuận" sortKey="profit" sort={tc.sort} onSort={tc.toggleSort} align="right" />
                  <SortableTh label="Trạng thái" sortKey="status" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Người tạo</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[120px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(inv => {
                  const profit = displayMerchProfit(inv);
                  const margin = inv.total && profit != null ? profit / inv.total : 0;
                  return (
                  <tr key={inv.id} className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors", inv.status === 'cancelled' && "opacity-60")}>
                    <td className="px-3 py-2.5 font-mono text-xs font-medium">
                      <button onClick={() => setDetailInvoice(inv)} className="hover:text-primary hover:underline">{inv.number}</button>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{formatDateTime(inv.date)}</td>
                    <td className="px-3 py-2.5">{inv.customerName}</td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={inv.paymentType} /></td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatVND(inv.total)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {inv.status === 'cancelled' ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : profit == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-medium text-success">{formatVND(profit)}</span>
                          <span className="text-[10px] text-muted-foreground">{(margin * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={inv.status === 'cancelled' ? 'cancelled' : 'active'} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">{inv.createdBy}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setDetailInvoice(inv)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title="Xem chi tiết"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => handlePrint(inv)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title="In hóa đơn"><Printer className="h-3.5 w-3.5" /></button>
                        {inv.status === 'active' ? (
                          <button onClick={() => setCancelTarget(inv.id)} className="p-1 text-muted-foreground hover:text-danger rounded hover:bg-muted" title="Hủy"><XCircle className="h-3.5 w-3.5" /></button>
                        ) : (
                          <span className="p-1 inline-flex w-[26px]" />
                        )}
                        {canPhysicallyDeleteInvoice(inv) ? (
                          <button onClick={() => setDeleteTarget(inv.id)} className="p-1 text-muted-foreground hover:text-danger rounded hover:bg-muted" title="Xóa"><Trash2 className="h-3.5 w-3.5" /></button>
                        ) : (
                          <button
                            disabled
                            title={
                              inv.allowPhysicalDelete === false
                                ? "Hóa đơn backend không cho xóa vật lý — dùng Hủy hóa đơn"
                                : "Chỉ được xóa hóa đơn trong ngày tạo (cục bộ)"
                            }
                            className="p-1 text-muted-foreground/40 cursor-not-allowed"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {rows.map(inv => {
              const profit = displayMerchProfit(inv);
              return (
              <div key={inv.id} className={cn("bg-card rounded-lg border p-3", inv.status === 'cancelled' && "opacity-60")}>
                <button onClick={() => setDetailInvoice(inv)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-mono text-xs font-medium">{inv.number}</p>
                      <p className="text-xs text-muted-foreground">{inv.customerName} · {formatDateTime(inv.date)}</p>
                    </div>
                    <StatusBadge status={inv.status === 'cancelled' ? 'cancelled' : 'active'} />
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={inv.paymentType} />
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatVND(inv.total)}</p>
                      {inv.status !== "cancelled" && profit != null && (
                        <p className="text-[11px] text-success">LN: {formatVND(profit)}</p>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex gap-1 mt-2 pt-2 border-t">
                  <button onClick={() => setDetailInvoice(inv)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs border rounded"><Eye className="h-3 w-3" /> Chi tiết</button>
                  <button onClick={() => handlePrint(inv)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs border rounded"><Printer className="h-3 w-3" /> In</button>
                  {inv.status === 'active' && (
                    <button onClick={() => setCancelTarget(inv.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs border border-danger/30 text-danger rounded"><XCircle className="h-3 w-3" /> Hủy</button>
                  )}
                </div>
                {!canPhysicallyDeleteInvoice(inv) && inv.status === "active" && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    {inv.allowPhysicalDelete === false
                      ? "Không xóa vật lý hóa đơn máy chủ — dùng Hủy"
                      : "Chỉ xóa được trong ngày tạo (cục bộ)"}
                  </p>
                )}
              </div>
            );})}
          </div>

          <TablePagination
            page={tc.page} totalPages={tc.totalPages} total={tc.total}
            rangeStart={tc.rangeStart} rangeEnd={tc.rangeEnd}
            pageSize={tc.pageSize} onPageChange={tc.setPage} onPageSizeChange={tc.setPageSize}
          />
          </>
        )}
      </AsyncBoundary>

      <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} title="Hủy hóa đơn?" description="Hóa đơn đã hủy vẫn được lưu trong lịch sử. Thao tác này không thể hoàn tác." confirmLabel="Hủy hóa đơn" variant="danger" />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Xóa hóa đơn?" description="Hóa đơn sẽ bị xóa vĩnh viễn. Chỉ hóa đơn trong ngày mới được xóa." confirmLabel="Xóa" variant="danger" />
      <InvoiceDetailDrawer invoice={detailInvoice} onClose={() => setDetailInvoice(null)} />
    </div>
  );
}
