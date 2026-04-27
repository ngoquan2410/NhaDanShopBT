import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SupplierFormDrawer } from "@/components/shared/SupplierFormDrawer";
import { RowActions } from "@/components/shared/RowActions";
import { TablePagination } from "@/components/shared/TablePagination";
import { useTableControls } from "@/hooks/useTableControls";
import { useStore, supplierActions } from "@/lib/store";
import { Plus, Truck, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Supplier } from "@/lib/mock-data";

export default function AdminSuppliers() {
  const { suppliers } = useStore();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  const filtered = useMemo(() => suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
  ), [suppliers, search]);

  const tc = useTableControls<Supplier, "name" | "code">({
    data: filtered, pageSize: 20, initialSort: { key: "name", dir: "asc" },
    sortAccessors: { name: (s) => s.name, code: (s) => s.code },
    resetToken: search,
  });

  const openAdd = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setDrawerOpen(true); };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Nhà cung cấp"
        description={`${suppliers.length} nhà cung cấp`}
        actions={<button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"><Plus className="h-3.5 w-3.5" /> Thêm NCC</button>}
      />

      <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Tìm tên, mã, SĐT..." />

      {filtered.length === 0 ? (
        <EmptyState icon={Truck} title="Không tìm thấy nhà cung cấp" />
      ) : (
        <>
          <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nhà cung cấp</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mã</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">SĐT</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden lg:table-cell">Mã số thuế</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden xl:table-cell">Địa chỉ</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Trạng thái</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[60px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tc.pageRows.map(s => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">{s.email}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{s.code}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{s.phone}</td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">{s.taxCode}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs hidden xl:table-cell max-w-[200px] truncate">{s.address}</td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={s.active ? 'active' : 'inactive'} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center justify-end">
                        <RowActions
                          actions={[
                            { label: "Sửa", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(s) },
                            {
                              label: s.active ? "Ngừng hoạt động" : "Kích hoạt lại",
                              icon: s.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />,
                              onClick: () => {
                                supplierActions.update(s.id, { active: !s.active });
                                toast.success(s.active ? "Đã ngừng hoạt động" : "Đã kích hoạt lại");
                              },
                            },
                            { separatorBefore: true, label: "Xóa", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => setDeleting(s) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {tc.pageRows.map(s => (
              <div key={s.id} className="bg-card rounded-lg border p-3" onClick={() => openEdit(s)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-sm">{s.name}</h3>
                    <p className="text-xs text-muted-foreground">{s.code} · {s.phone}</p>
                    {s.note && <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>}
                  </div>
                  <StatusBadge status={s.active ? 'active' : 'inactive'} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{s.address}</p>
              </div>
            ))}
          </div>
          <TablePagination page={tc.page} totalPages={tc.totalPages} total={tc.total} rangeStart={tc.rangeStart} rangeEnd={tc.rangeEnd} pageSize={tc.pageSize} onPageChange={tc.setPage} onPageSizeChange={tc.setPageSize} />
        </>
      )}

      <SupplierFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} supplier={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { supplierActions.remove(deleting.id); toast.success("Đã xóa nhà cung cấp"); } }}
        title="Xóa nhà cung cấp?"
        description={`Bạn chắc chắn muốn xóa "${deleting?.name}"?`}
        variant="danger"
        confirmLabel="Xóa"
      />
    </div>
  );
}
