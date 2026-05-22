import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SupplierFormDrawer } from "@/components/shared/SupplierFormDrawer";
import { RowActions } from "@/components/shared/RowActions";
import { TablePagination } from "@/components/shared/TablePagination";
import { useTableControls } from "@/hooks/useTableControls";
import { useService } from "@/hooks/useService";
import { adminSuppliers } from "@/services";
import { Plus, Truck, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import type { Supplier } from "@/lib/mock-data";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function AdminSuppliers() {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 250);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [deleting, setDeleting] = useState<Supplier | null>(null);
    const { data, loading, error, reload } = useService(
        () =>
            adminSuppliers.list({
                q: debouncedSearch || undefined,
                page,
                pageSize,
            }),
        [debouncedSearch, page, pageSize],
    );
    const suppliers = data?.items ?? [];
    const total = data?.total ?? 0;

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch]);

    const tc = useTableControls<Supplier, "name" | "code">({
        data: suppliers,
        pageSize: Math.max(suppliers.length, 1),
        initialSort: { key: "name", dir: "asc" },
        sortAccessors: { name: (s) => s.name, code: (s) => s.code },
        resetToken: `${debouncedSearch}|${page}`,
    });

    const openAdd = () => { setEditing(null); setDrawerOpen(true); };
    const openEdit = (s: Supplier) => { setEditing(s); setDrawerOpen(true); };

    return (
        <div className="space-y-4 admin-dense">
            <PageHeader
                title="Nhà cung cấp"
                description={`${total} nhà cung cấp`}
                actions={<button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"><Plus className="h-3.5 w-3.5" /> Thêm NCC</button>}
            />

            <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Tìm tên, mã, SĐT..." />

            {loading && <p className="text-sm text-muted-foreground">Đang tải nhà cung cấp từ backend...</p>}
            {error && <p className="text-sm text-danger">Không tải được nhà cung cấp: {error.message}</p>}

            {!loading && suppliers.length === 0 ? (
                <EmptyState icon={Truck} title="Không tìm thấy nhà cung cấp" />
            ) : !loading && (
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
                                        <RowActions
                                            actions={[
                                                { label: "Sửa", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(s) },
                                                {
                                                    label: s.active ? "Ngừng hợp tác" : "Kích hoạt lại",
                                                    icon: s.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />,
                                                    onClick: () => {
                                                        adminSuppliers.save({ ...s, active: !s.active })
                                                            .then(() => { toast.success(s.active ? "Đã ngừng hợp tác" : "Đã kích hoạt lại"); reload(); })
                                                            .catch((err) => toast.error(err instanceof Error ? err.message : "Không thể đổi trạng thái"));
                                                    },
                                                },
                                                { separatorBefore: true, label: "Xóa", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => setDeleting(s) },
                                            ]}
                                        />
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
                                    <div className="min-w-0">
                                        <h3 className="font-medium text-sm">{s.name}</h3>
                                        <p className="text-xs text-muted-foreground truncate">{s.code} · {s.phone}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <StatusBadge status={s.active ? 'active' : 'inactive'} />
                                        <RowActions
                                            actions={[
                                                { label: "Sửa", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(s) },
                                                {
                                                    label: s.active ? "Ngừng hợp tác" : "Kích hoạt lại",
                                                    icon: s.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />,
                                                    onClick: () => {
                                                        adminSuppliers.save({ ...s, active: !s.active })
                                                            .then(() => { toast.success(s.active ? "Đã ngừng hợp tác" : "Đã kích hoạt lại"); reload(); })
                                                            .catch((err) => toast.error(err instanceof Error ? err.message : "Không thể đổi trạng thái"));
                                                    },
                                                },
                                                { separatorBefore: true, label: "Xóa", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => setDeleting(s) },
                                            ]}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <TablePagination
                        page={page}
                        totalPages={Math.max(1, Math.ceil(total / pageSize))}
                        total={total}
                        rangeStart={total === 0 ? 0 : (page - 1) * pageSize + 1}
                        rangeEnd={Math.min(total, page * pageSize)}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={(n) => {
                            setPageSize(n);
                            setPage(1);
                        }}
                    />
                </>
            )}

            <SupplierFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} supplier={editing} onSave={async (input) => { await adminSuppliers.save(input); reload(); }} />
            <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => {
                if (deleting) {
                    adminSuppliers.remove(deleting.id)
                        .then(() => { toast.success("Đã xóa nhà cung cấp"); reload(); })
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Không thể xóa nhà cung cấp"));
                }
            }} title="Xóa nhà cung cấp?" description={`Bạn chắc chắn muốn xóa "${deleting?.name}"?`} variant="danger" confirmLabel="Xóa" />
        </div>
    );
}
