import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar, FilterChip } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useStore, promotionActions } from "@/lib/store";
import { formatDate } from "@/lib/format";
import {
  type Promotion,
  type PromotionType,
  PROMOTION_TYPE_LABELS,
  makeEmptyPromotion,
  formatPromotionSummary,
  formatScope,
} from "@/lib/promotions";
import { PromotionFormShell } from "@/components/promotions/PromotionFormShell";
import { TablePagination } from "@/components/shared/TablePagination";
import { useTableControls } from "@/hooks/useTableControls";
import { Plus, Tags, Calendar, Pencil, Trash2, Power } from "lucide-react";
import { toast } from "sonner";

const TYPE_ICON_BG: Record<PromotionType, string> = {
  percent: "bg-primary-soft text-primary",
  fixed: "bg-primary-soft text-primary",
  "buy-x-get-y": "bg-warning-soft text-warning",
  gift: "bg-warning-soft text-warning",
  "free-shipping": "bg-muted text-foreground",
};

export default function AdminPromotions() {
  const { promotions: promoList, categories, products } = useStore();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<PromotionType | null>(null);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const categoryNames = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const productNames = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);

  const filtered = promoList.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === "active" && !p.active) return false;
    if (filterStatus === "inactive" && p.active) return false;
    if (filterType && p.type !== filterType) return false;
    return true;
  });

  const tc = useTableControls<typeof filtered[number], "name" | "type" | "start">({
    data: filtered, pageSize: 20, initialSort: { key: "start", dir: "desc" },
    sortAccessors: { name: (p) => p.name, type: (p) => p.type, start: (p) => new Date(p.startDate) },
    resetToken: `${search}|${filterStatus}|${filterType}`,
  });

  const handleSave = (promo: Promotion) => {
    promotionActions.upsert(promo);
    toast.success(promo.id ? `Đã cập nhật "${promo.name}"` : `Đã tạo "${promo.name}"`);
    setEditing(null);
  };

  const toggleActive = (id: string) => {
    const p = promoList.find((x) => x.id === id);
    promotionActions.toggleActive(id);
    toast.success(`Đã ${p?.active ? "tạm dừng" : "kích hoạt"} "${p?.name}"`);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const p = promoList.find((x) => x.id === deleteTarget);
    promotionActions.remove(deleteTarget);
    toast.success(`Đã xóa "${p?.name}"`);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Khuyến mãi"
        description={`${promoList.length} chương trình`}
        actions={
          <button
            onClick={() => setEditing(makeEmptyPromotion("percent"))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"
          >
            <Plus className="h-3.5 w-3.5" /> Tạo khuyến mãi
          </button>
        }
      />

      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm khuyến mãi..."
        filters={
          <>
            <FilterChip label="Tất cả" active={!filterStatus && !filterType} onClick={() => { setFilterStatus(null); setFilterType(null); }} />
            <FilterChip label="Đang chạy" active={filterStatus === "active"} onClick={() => setFilterStatus(filterStatus === "active" ? null : "active")} />
            <FilterChip label="Tạm dừng" active={filterStatus === "inactive"} onClick={() => setFilterStatus(filterStatus === "inactive" ? null : "inactive")} />
            <span className="w-px h-5 bg-border mx-1" />
            {(Object.entries(PROMOTION_TYPE_LABELS) as [PromotionType, string][]).map(([k, label]) => (
              <FilterChip key={k} label={label} active={filterType === k} onClick={() => setFilterType(filterType === k ? null : k)} />
            ))}
          </>
        }
      />

      {filtered.length === 0 ? (
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
          {tc.pageRows.map((p) => {
            const summary = formatPromotionSummary(p);
            const scopeText = formatScope(p, { categoryNames, productNames });
            return (
              <div key={p.id} className="bg-card rounded-lg border p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-sm">{p.name}</h3>
                      <StatusBadge status={p.active ? "active" : "inactive"} />
                      <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full ${TYPE_ICON_BG[p.type]}`}>
                        {PROMOTION_TYPE_LABELS[p.type]}
                      </span>
                    </div>
                    <p className="text-sm text-foreground font-medium mt-1">{summary}</p>
                    {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground bg-muted rounded-full">
                        <Calendar className="h-3 w-3" /> {formatDate(p.startDate)} — {formatDate(p.endDate)}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] text-muted-foreground bg-muted rounded-full">
                        {scopeText}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
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
          <TablePagination page={tc.page} totalPages={tc.totalPages} total={tc.total} rangeStart={tc.rangeStart} rangeEnd={tc.rangeEnd} pageSize={tc.pageSize} onPageChange={tc.setPage} onPageSizeChange={tc.setPageSize} />
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
