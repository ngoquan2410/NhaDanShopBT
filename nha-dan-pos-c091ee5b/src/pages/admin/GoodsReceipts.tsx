import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { AsyncBoundary } from "@/components/shared/AsyncBoundary";
import { BlockedActionBanner } from "@/components/shared/BlockedActionBanner";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ReceiptImportPreviewDialog } from "@/components/shared/ReceiptImportPreviewDialog";
import { GoodsReceiptDetailDrawer } from "@/components/shared/GoodsReceiptDetailDrawer";
import { ReceiptDeleteBlockedDialog } from "@/components/shared/ReceiptDeleteBlockedDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TablePagination } from "@/components/shared/TablePagination";
import { SortableTh } from "@/components/shared/SortableTh";
import { PeriodFilter, type PeriodValue } from "@/components/shared/PeriodFilter";
import { goodsReceipts as goodsReceiptsService } from "@/services";
import { useService } from "@/hooks/useService";
import type { GoodsReceipt } from "@/services/types";
import { formatVND, formatDate } from "@/lib/format";
import {
  deriveReceiptUiState,
  isDownstreamConsumptionConflict,
  isReceiptVoided,
  isVoidedDeleteConflict,
} from "@/lib/receiptUiState";
import { AdminApiError } from "@/services/auth/adminApi";
import { useDrafts, draftActions } from "@/lib/drafts";
import { useTableControls } from "@/hooks/useTableControls";
import { Plus, FileInput, Eye, Trash2, Printer, ShieldAlert, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { localToday, toLocalDateString } from "@/lib/localDate";

type SortKey = "number" | "date" | "supplier" | "items" | "total" | "actual";

function startOfWeekISO(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toLocalDateString(d);
}

function startOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return toLocalDateString(d);
}

function periodToReceiptDateRange(period: PeriodValue): { from: string; to: string } | undefined {
  if (period.preset === "all") return undefined;
  const to = localToday();
  let from: string;
  if (period.preset === "today") {
    from = to;
  } else if (period.preset === "week") {
    from = startOfWeekISO();
  } else if (period.preset === "month") {
    from = startOfMonthISO();
  } else {
    if (!period.from || !period.to) return undefined;
    return { from: period.from, to: period.to };
  }
  return { from, to };
}

export default function AdminGoodsReceipts() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [period, setPeriod] = useState<PeriodValue>({ preset: "all" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<string | null>(null);
  const [detail, setDetail] = useState<GoodsReceipt | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<GoodsReceipt | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const drafts = useDrafts();

  const dateRange = useMemo(() => periodToReceiptDateRange(period), [period]);

  const { data, loading, error, isEmpty, reload } = useService(
    () =>
      goodsReceiptsService.list({
        page,
        pageSize,
        query: debouncedSearch || undefined,
        dateRange,
        sort: [{ field: "date", direction: "desc" }],
      }),
    [debouncedSearch, dateRange, page, pageSize],
  );

  const receipts: GoodsReceipt[] = data?.items ?? [];

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, period.preset, period.from, period.to]);

  const tc = useTableControls<GoodsReceipt, SortKey>({
    data: receipts,
    /** Must match server page size — never derive from receipts.length (first paint used 1 → only one row). */
    pageSize,
    initialSort: { key: "date", dir: "desc" },
    sortAccessors: {
      number: (r) => r.number,
      date: (r) => new Date(r.date),
      supplier: (r) => r.supplierName,
      items: (r) => r.itemCount,
      total: (r) => r.totalCost + r.shippingFee + r.vat,
      actual: (r) => r.subtotal + r.shippingFee + r.vat,
    },
    resetToken: `${debouncedSearch}|${page}|${period.preset}|${period.from}|${period.to}`,
  });

  const filteredDrafts = drafts.filter(d =>
    !search || d.number.toLowerCase().includes(search.toLowerCase()) || d.supplierName.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const targetRow = receipts.find((r) => r.id === deleteTarget);
    try {
      await goodsReceiptsService.remove(deleteTarget);
      toast.success("Đã xóa phiếu nhập");
      setDeleteTarget(null);
      reload();
    } catch (e) {
      setDeleteTarget(null);
      if (e instanceof AdminApiError && e.status === 409) {
        if (isDownstreamConsumptionConflict(e)) {
          if (targetRow) setDeleteBlocked(targetRow);
          return;
        }
        if (isVoidedDeleteConflict(e)) {
          toast.error("Phiếu đã void nên không thể xóa.");
          return;
        }
        toast.error(e.message || "Không xóa được phiếu nhập");
        return;
      }
      toast.error(e instanceof Error ? e.message : "Không xóa được phiếu nhập");
    }
  };

  const handleDeleteDraft = () => {
    if (!deleteDraft) return;
    draftActions.remove(deleteDraft);
    toast.success("Đã xóa phiếu nháp");
    setDeleteDraft(null);
  };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Phiếu nhập"
        description={`${data?.total ?? 0} phiếu nhập${drafts.length ? ` · ${drafts.length} nháp` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Nhập Excel
            </button>
            <Link to="/admin/goods-receipts/create" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
              <Plus className="h-3.5 w-3.5" /> Tạo phiếu nhập
            </Link>
          </div>
        }
      />

      <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Tìm số phiếu, NCC..." />
      <PeriodFilter value={period} onChange={setPeriod} disableFutureDates />

      {filteredDrafts.length > 0 && (
        <div className="bg-info-soft/40 border border-info/20 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-3.5 w-3.5 text-info" />
            <h3 className="text-xs font-semibold text-info uppercase tracking-wide">Phiếu nháp ({filteredDrafts.length})</h3>
          </div>
          <div className="space-y-1.5">
            {filteredDrafts.map(d => {
              const total = d.lines.reduce((s, l) => s + l.unitCost * l.quantity * (1 - l.discount / 100), 0) + d.shippingFee + (d.lines.reduce((s, l) => s + l.unitCost * l.quantity, 0) * d.vat / 100);
              return (
                <div key={d.id} className="bg-card rounded-md border p-2.5 flex items-center gap-3 text-xs">
                  <StatusBadge status="draft" />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium">{d.number}</p>
                    <p className="text-muted-foreground truncate">{d.supplierName} · {d.lines.length} mặt hàng</p>
                  </div>
                  <span className="font-medium">{formatVND(total)}</span>
                  <Link to={`/admin/goods-receipts/create?draft=${d.id}`} className="px-2 py-1 text-[11px] font-medium border rounded hover:bg-muted">
                    Mở nháp
                  </Link>
                  <button onClick={() => setDeleteDraft(d.id)} className="p-1 text-muted-foreground hover:text-danger" title="Xóa nháp">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={!loading && !error && (isEmpty || receipts.length === 0)}
        data={tc.pageRows}
        onRetry={reload}
        emptyFallback={<EmptyState icon={FileInput} title="Chưa có phiếu nhập" description="Tạo phiếu nhập đầu tiên" />}
      >
        {(rows) => (
          <>
          <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <SortableTh label="Số phiếu" sortKey="number" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Ngày nhập" sortKey="date" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Nhà cung cấp" sortKey="supplier" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Mặt hàng" sortKey="items" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                  <SortableTh label="Tổng tiền" sortKey="total" sort={tc.sort} onSort={tc.toggleSort} align="right" />
                  <SortableTh label="Tong thuc tra" sortKey="actual" sort={tc.sort} onSort={tc.toggleSort} align="right" />
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[110px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const ui = deriveReceiptUiState(r);
                  return (
                  <tr key={r.id} data-testid={`goods-receipt-row-${r.id}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-medium">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isReceiptVoided(r) && (
                          <span
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap"
                            data-testid={`goods-receipt-voided-badge-${r.id}`}
                          >
                            Đã void
                          </span>
                        )}
                        <button onClick={() => setDetail(r)} className="hover:text-primary hover:underline">{r.number}</button>
                        {isReceiptVoided(r) && r.voidReason && (
                          <span className="text-[10px] text-muted-foreground font-sans max-w-[140px] truncate" title={r.voidReason}>
                            {r.voidReason}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(r.date)}</td>
                    <td className="px-3 py-2.5">{r.supplierName}</td>
                    <td className="px-3 py-2.5 text-center">{r.itemCount}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatVND(r.totalCost + r.shippingFee + r.vat)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{formatVND(r.subtotal + r.shippingFee + r.vat)}</td>
                    <td className="px-3 py-2.5">
                      <div className="inline-flex items-center justify-end gap-0.5 w-full">
                        <button onClick={() => setDetail(r)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title="Xem chi tiết"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDetail(r)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title="In phiếu (mở chi tiết)"><Printer className="h-3.5 w-3.5" /></button>
                        {ui === "CONFIRMED_DELETE_ALLOWED" ? (
                          <button onClick={() => setDeleteTarget(r.id)} className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted" title="Xóa" data-testid={`goods-receipt-delete-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        ) : ui === "CONFIRMED_DOWNSTREAM_BLOCKED" ? (
                          <button type="button" data-testid={`goods-receipt-delete-hint-${r.id}`} onClick={() => setDeleteBlocked(r)} className="p-1.5 text-warning/80 hover:text-warning rounded hover:bg-warning-soft" title="Không thể xóa — xem hướng dẫn">
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                        ) : ui === "VOIDED" ? (
                          <button type="button" disabled className="p-1.5 text-muted-foreground/50 rounded cursor-not-allowed" title="Phiếu đã void nên không thể xóa.">
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button type="button" disabled className="p-1.5 text-muted-foreground/50 rounded cursor-not-allowed" title={r.deleteBlockReason ? `Không thể xóa (${r.deleteBlockReason})` : "Không thể xóa phiếu nhập"}>
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {rows.map(r => {
              const ui = deriveReceiptUiState(r);
              return (
              <div key={r.id} className="bg-card rounded-lg border p-3" onClick={() => setDetail(r)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-mono text-xs font-medium flex flex-wrap items-center gap-1.5">
                      {isReceiptVoided(r) && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Đã void</span>}
                      {r.number}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.supplierName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-muted-foreground">{r.itemCount} mặt hàng</span>
                  <span className="font-bold">{formatVND(r.totalCost + r.shippingFee + r.vat)}</span>
                </div>
                {ui === "CONFIRMED_DOWNSTREAM_BLOCKED" && (
                  <BlockedActionBanner message="Không thể xóa — hàng từ phiếu này đã được bán" className="mt-2" />
                )}
                {ui === "VOIDED" && (
                  <BlockedActionBanner message="Phiếu đã void nên không thể xóa." className="mt-2" />
                )}
              </div>
              );
            })}
          </div>

          <TablePagination
            page={page}
            totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))}
            total={data?.total ?? 0}
            rangeStart={(data?.total ?? 0) === 0 ? 0 : (page - 1) * pageSize + 1}
            rangeEnd={Math.min(data?.total ?? 0, page * pageSize)}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
          </>
        )}
      </AsyncBoundary>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Xóa phiếu nhập?" description="Thao tác này không thể hoàn tác. Tồn kho sẽ được điều chỉnh lại."
        confirmLabel="Xóa phiếu nhập" variant="danger" />
      <ConfirmDialog open={!!deleteDraft} onClose={() => setDeleteDraft(null)} onConfirm={handleDeleteDraft}
        title="Xóa phiếu nháp?" description="Phiếu nháp sẽ bị xóa khỏi danh sách."
        confirmLabel="Xóa nháp" variant="danger" />

      <GoodsReceiptDetailDrawer
        receipt={detail}
        onClose={() => setDetail(null)}
        onReceiptChanged={reload}
        onReceiptUpdated={(r) => setDetail(r)}
      />
      <ReceiptDeleteBlockedDialog
        open={!!deleteBlocked}
        receiptNumber={deleteBlocked?.number}
        deleteBlockReason={deleteBlocked?.deleteBlockReason ?? null}
        onClose={() => setDeleteBlocked(null)}
        onViewBatches={() => deleteBlocked && setDetail(deleteBlocked)}
        onVoid={() => {
          if (deleteBlocked) {
            setDetail(deleteBlocked);
          }
        }}
      />
      <ReceiptImportPreviewDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
