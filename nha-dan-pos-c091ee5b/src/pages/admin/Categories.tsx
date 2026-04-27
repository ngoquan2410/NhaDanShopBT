import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { TablePagination } from "@/components/shared/TablePagination";
import { SortableTh } from "@/components/shared/SortableTh";
import { useTableControls } from "@/hooks/useTableControls";
import { useStore, categoryActions } from "@/lib/store";
import type { Category } from "@/lib/mock-data";
import { Plus, Pencil, Trash2, FolderTree, Check, Power } from "lucide-react";
import { toast } from "sonner";

interface FormState { id?: string; name: string; description: string }
const empty: FormState = { name: "", description: "" };

export default function AdminCategories() {
  const { categories } = useStore();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const filtered = useMemo(
    () => categories.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())),
    [categories, search],
  );

  const tc = useTableControls<Category, "name" | "products" | "status">({
    data: filtered,
    pageSize: 20,
    initialSort: { key: "name", dir: "asc" },
    sortAccessors: {
      name: (c) => c.name,
      products: (c) => c.productCount,
      status: (c) => (c.active ? 1 : 0),
    },
    resetToken: search,
  });

  const openCreate = () => setForm({ ...empty });
  const openEdit = (c: Category) => setForm({ id: c.id, name: c.name, description: c.description });

  const handleSave = () => {
    if (!form) return;
    if (!form.name.trim()) { toast.error("Vui lòng nhập tên danh mục"); return; }
    if (form.id) {
      categoryActions.update(form.id, { name: form.name.trim(), description: form.description.trim() });
      toast.success("Đã cập nhật danh mục");
    } else {
      categoryActions.create({ name: form.name.trim(), description: form.description.trim() });
      toast.success("Đã tạo danh mục mới");
    }
    setForm(null);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    categoryActions.remove(confirmDelete.id);
    toast.success(`Đã xóa danh mục "${confirmDelete.name}"`);
  };

  const handleToggle = (c: Category) => {
    categoryActions.toggleActive(c.id);
    toast.success(c.active ? `Đã ngưng "${c.name}"` : `Đã kích hoạt "${c.name}"`);
  };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Danh mục"
        description={`${categories.length} danh mục`}
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
            <Plus className="h-3.5 w-3.5" /> Thêm danh mục
          </button>
        }
      />

      <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Tìm danh mục..." />

      {form && (
        <div className="bg-card rounded-lg border p-4 animate-fade-in">
          <h3 className="font-semibold text-sm mb-3">{form.id ? "Sửa danh mục" : "Tạo danh mục mới"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tên danh mục *</label>
              <input
                autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Thực phẩm khô"
                className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mô tả</label>
              <input
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Mô tả ngắn gọn"
                className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
              <Check className="h-3 w-3" /> Lưu
            </button>
            <button onClick={() => setForm(null)} className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">Hủy</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={FolderTree} title="Chưa có danh mục" description="Tạo danh mục đầu tiên để phân loại sản phẩm" />
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <SortableTh label="Tên danh mục" sortKey="name" sort={tc.sort} onSort={tc.toggleSort} />
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Mô tả</th>
                <SortableTh label="Sản phẩm" sortKey="products" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                <SortableTh label="Trạng thái" sortKey="status" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {tc.pageRows.map(cat => (
                <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-medium">{cat.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{cat.description}</td>
                  <td className="px-3 py-2.5 text-center">{cat.productCount}</td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={cat.active ? "active" : "inactive"} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <button onClick={() => handleToggle(cat)} title={cat.active ? "Ngưng" : "Kích hoạt"} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openEdit(cat)} title="Sửa" className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete(cat)} title="Xóa" className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2 border-t">
            <TablePagination
              page={tc.page} totalPages={tc.totalPages} total={tc.total}
              rangeStart={tc.rangeStart} rangeEnd={tc.rangeEnd}
              pageSize={tc.pageSize} onPageChange={tc.setPage} onPageSizeChange={tc.setPageSize}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Xóa danh mục"
        description={`Bạn có chắc muốn xóa danh mục "${confirmDelete?.name}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
      />
    </div>
  );
}
