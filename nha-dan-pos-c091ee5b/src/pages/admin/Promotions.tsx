import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar, FilterChip } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useService } from "@/hooks/useService";
import { formatDate } from "@/lib/format";
import {
  type Promotion,
  type PromotionEffectiveStatus,
  type PromotionType,
  PROMOTION_EFFECTIVE_STATUS_LABELS,
  PROMOTION_TYPE_LABELS,
  makeEmptyPromotion,
  formatPromotionSummary,
  formatScope,
  getPromotionEffectiveStatus,
} from "@/lib/promotions";
import { PromotionFormShell } from "@/components/promotions/PromotionFormShell";
import { TablePagination } from "@/components/shared/TablePagination";
import { Plus, Tags, Calendar, Pencil, Trash2, Power } from "lucide-react";
import { toast } from "sonner";
import { categories as categoryService, promotionsCrud } from "@/services";

const TYPE_ICON_BG: Record<PromotionType, string> = {
  percent: "bg-primary-soft text-primary",
  fixed: "bg-primary-soft text-primary",
  "buy-x-get-y": "bg-warning-soft text-warning",
  gift: "bg-warning-soft text-warning",
  "free-shipping": "bg-muted text-foreground",
};

const STATUS_BADGE: Record<PromotionEffectiveStatus, { status: "active" | "inactive" | "pending" | "expired"; label: string }> = {
  running: { status: "active", label: PROMOTION_EFFECTIVE_STATUS_LABELS.running },
  scheduled: { status: "pending", label: PROMOTION_EFFECTIVE_STATUS_LABELS.scheduled },
  expired: { status: "expired", label: PROMOTION_EFFECTIVE_STATUS_LABELS.expired },
  inactive: { status: "inactive", label: PROMOTION_EFFECTIVE_STATUS_LABELS.inactive },
};

export default function AdminPromotions() {
  const [promoList, setPromoList] = useState<Promotion[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<PromotionEffectiveStatus | null>(null);
  const [filterType, setFilterType] = useState<PromotionType | null>(null);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const { data: categoryData } = useService(() => categoryService.list({ active: false }), []);
  const categories = categoryData?.items ?? [];

  const categoryNames = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    promotionsCrud.list({
      page,
      pageSize,
      query: search || undefined,
      status: filterStatus ?? undefined,
      kinds: filterType ? [filterType] : undefined,
    })
        .then((page) => {
          if (cancel) return;
          setPromoList(page.items);
          setTotal(page.total);
          setApiError(null);
        })
        .catch((err) => {
          if (cancel) return;
          const message = err instanceof Error ? err.message : "Không tải được khuyến mãi từ backend";
          setApiError(message);
          setPromoList([]);
        })
        .finally(() => {
          if (!cancel) setLoading(false);
        });
    return () => { cancel = true; };
  }, [page, pageSize, search, filterStatus, filterType]);

  const handleSave = async (promo: Promotion) => {
    try {
      const saved = await promotionsCrud.upsert(promo);
      setPromoList((rows) => {
        const exists = rows.some((p) => p.id === saved.id || (promo.id && p.id === promo.id));
        return exists ? rows.map((p) => (p.id === saved.id || p.id === promo.id ? saved : p)) : [saved, ...rows];
      });
      setApiError(null);
      toast.success(promo.id ? `Đã cập nhật "${saved.name}"` : `Đã tạo "${saved.name}"`);
      setEditing(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lưu khuyến mãi thất bại";
      setApiError(message);
      toast.error(message);
    }
  };

  const toggleActive = async (id: string) => {
    const p = promoList.find((x) => x.id === id);
    try {
      await promotionsCrud.toggleActive(id);
      setPromoList((rows) => rows.map((x) => (x.id === id ? { ...x, active: !x.active } : x)));
      setApiError(null);
      toast.success(`Đã ${p?.active ? "tạm dừng" : "kích hoạt"} "${p?.name}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đổi trạng thái khuyến mãi thất bại";
      setApiError(message);
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const p = promoList.find((x) => x.id === deleteTarget);
    try {
      await promotionsCrud.remove(deleteTarget);
      setPromoList((rows) => rows.filter((x) => x.id !== deleteTarget));
      setApiError(null);
      toast.success(`Đã xóa "${p?.name}"`);
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Xóa khuyến mãi thất bại";
      setApiError(message);
      toast.error(message);
    }
  };

  return (
      <div className="space-y-4 admin-dense">
        <PageHeader
            title="Khuyến mãi"
            description={loading ? "Đang tải..." : `${promoList.length} chương trình`}
            actions={
              <button
                  onClick={() => setEditing(makeEmptyPromotion("percent"))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" /> Tạo khuyến mãi
              </button>
            }
        />

        {apiError && (
            <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
              Lỗi API khuyến mãi: {apiError}
            </div>
        )}

        <DataTableToolbar
            search={search}
            onSearchChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            searchPlaceholder="Tìm khuyến mãi..."
            filters={
              <>
                <FilterChip label="Tất cả" active={!filterStatus && !filterType} onClick={() => { setPage(1); setFilterStatus(null); setFilterType(null); }} />
                <FilterChip label="Đang chạy" active={filterStatus === "running"} onClick={() => { setPage(1); setFilterStatus(filterStatus === "running" ? null : "running"); }} />
                <FilterChip label="Sắp diễn ra" active={filterStatus === "scheduled"} onClick={() => { setPage(1); setFilterStatus(filterStatus === "scheduled" ? null : "scheduled"); }} />
                <FilterChip label="Đã hết hạn" active={filterStatus === "expired"} onClick={() => { setPage(1); setFilterStatus(filterStatus === "expired" ? null : "expired"); }} />
                <FilterChip label="Tạm dừng" active={filterStatus === "inactive"} onClick={() => { setPage(1); setFilterStatus(filterStatus === "inactive" ? null : "inactive"); }} />
                <span className="w-px h-5 bg-border mx-1" />
                {(Object.entries(PROMOTION_TYPE_LABELS) as [PromotionType, string][]).map(([k, label]) => (
                    <FilterChip key={k} label={label} active={filterType === k} onClick={() => { setPage(1); setFilterType(filterType === k ? null : k); }} />
                ))}
              </>
            }
        />

        {promoList.length === 0 ? (
            <EmptyState
                icon={Tags}
                title="Chưa có khuyến mãi"
                description="Tạo chương trình khuyến mãi đầu tiên"
                action={
                  <button
                      onClick={() => setEditing(makeEmptyPromotion("percent"))}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tạo khuyến mãi
                  </button>
                }
            />
        ) : (
            <div className="space-y-2">
              {promoList.map((p) => {
                const summary = formatPromotionSummary(p);
                const scopeText = formatScope(p, { categoryNames });
                const effectiveStatus = getPromotionEffectiveStatus(p);
                const badge = STATUS_BADGE[effectiveStatus];
                return (
                    <div key={p.id} className="bg-card rounded-lg border p-3 sm:p-4 hover:shadow-sm transition-shadow">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <h3 className="font-medium text-sm leading-snug break-words min-w-0 flex-1 sm:flex-none">
                              {p.name}
                            </h3>
                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                              <StatusBadge status={badge.status} label={badge.label} />
                              <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${TYPE_ICON_BG[p.type]}`}>
                          {PROMOTION_TYPE_LABELS[p.type]}
                        </span>
                            </div>
                          </div>
                          <p className="text-sm text-foreground font-medium mt-1.5 line-clamp-2">{summary}</p>
                          {p.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground bg-muted rounded-full whitespace-nowrap">
                        <Calendar className="h-3 w-3" /> {formatDate(p.startDate)} — {formatDate(p.endDate)}
                      </span>
                            <span className="inline-flex items-center px-2 py-0.5 text-[11px] text-muted-foreground bg-muted rounded-full max-w-full truncate">
                        {scopeText}
                      </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 sm:self-start -mr-1 sm:mr-0">
                          <button onClick={() => toggleActive(p.id)} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title={p.active ? "Tạm dừng" : "Kích hoạt"}>
                            <Power className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditing({ ...p })} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted" title="Sửa">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(p.id)} className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted" title="Xóa">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                );
              })}
              <TablePagination
                  page={page}
                  totalPages={Math.max(1, Math.ceil(total / pageSize))}
                  total={total}
                  rangeStart={total === 0 ? 0 : (page - 1) * pageSize + 1}
                  rangeEnd={Math.min(page * pageSize, total)}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(value) => {
                    setPage(1);
                    setPageSize(value);
                  }}
              />
            </div>
        )}

        {editing && <PromotionFormShell promo={editing} onClose={() => setEditing(null)} onSave={handleSave} />}
        <ConfirmDialog
            open={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
            title="Xóa khuyến mãi?"
            description="Khuyến mãi sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác."
            confirmLabel="Xóa"
            variant="danger"
        />
      </div>
  );
}
