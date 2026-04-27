import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar, FilterChip } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CustomerFormDrawer } from "@/components/shared/CustomerFormDrawer";
import { RowActions } from "@/components/shared/RowActions";
import { TablePagination } from "@/components/shared/TablePagination";
import { SortableTh } from "@/components/shared/SortableTh";
import { useTableControls } from "@/hooks/useTableControls";
import { useStore, customerActions } from "@/lib/store";
import { formatVND } from "@/lib/format";
import { Plus, Users, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Customer } from "@/lib/mock-data";

export default function AdminCustomers() {
  const { customers } = useStore();
  const initialQ = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') ?? '' : '';
  const [search, setSearch] = useState(initialQ);
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const filtered = useMemo(() => customers.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.phone.includes(search) && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterGroup && c.group !== filterGroup) return false;
    return true;
  }), [customers, search, filterGroup]);

  const tc = useTableControls<Customer, "name" | "code" | "phone" | "group" | "total" | "orders" | "status">({
    data: filtered,
    pageSize: 20,
    initialSort: { key: "total", dir: "desc" },
    sortAccessors: {
      name: (c) => c.name,
      code: (c) => c.code,
      phone: (c) => c.phone,
      group: (c) => c.group,
      total: (c) => c.totalPurchases,
      orders: (c) => c.orderCount,
      status: (c) => (c.active ? 1 : 0),
    },
    resetToken: `${search}|${filterGroup}`,
  });

  const openAdd = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setDrawerOpen(true); };

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Khách hàng"
        description={`${customers.length} khách hàng`}
        actions={<button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover"><Plus className="h-3.5 w-3.5" /> Thêm khách hàng</button>}
      />

      <DataTableToolbar
        search={search} onSearchChange={setSearch} searchPlaceholder="Tìm tên, SĐT, mã KH..."
        filters={<>
          <FilterChip label="Tất cả" active={!filterGroup} onClick={() => setFilterGroup(null)} />
          <FilterChip label="VIP" active={filterGroup === 'vip'} onClick={() => setFilterGroup('vip')} />
          <FilterChip label="Sỉ" active={filterGroup === 'wholesale'} onClick={() => setFilterGroup('wholesale')} />
          <FilterChip label="Lẻ" active={filterGroup === 'retail'} onClick={() => setFilterGroup('retail')} />
        </>}
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Không tìm thấy khách hàng" description="Thử thay đổi bộ lọc hoặc thêm mới" />
      ) : (
        <>
          <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Khách hàng</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mã</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">SĐT</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Nhóm</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Tổng mua</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Đơn</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Trạng thái</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[60px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tc.pageRows.map(c => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 bg-primary-soft rounded-full flex items-center justify-center text-xs font-bold text-primary shrink-0">{c.name.charAt(0)}</div>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.email && <p className="text-[11px] text-muted-foreground">{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{c.code}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{c.phone}</td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={c.group} /></td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatVND(c.totalPurchases)}</td>
                    <td className="px-3 py-2.5 text-center">{c.orderCount}</td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={c.active ? 'active' : 'inactive'} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center justify-end">
                        <RowActions
                          actions={[
                            { label: "Sửa", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(c) },
                            {
                              label: c.active ? "Ngừng hoạt động" : "Kích hoạt lại",
                              icon: c.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />,
                              onClick: () => {
                                customerActions.update(c.id, { active: !c.active });
                                toast.success(c.active ? "Đã ngừng hoạt động" : "Đã kích hoạt lại");
                              },
                            },
                            { separatorBefore: true, label: "Xóa", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: () => setDeleting(c) },
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
            {tc.pageRows.map(c => (
              <div key={c.id} className="bg-card rounded-lg border p-3" onClick={() => openEdit(c)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 bg-primary-soft rounded-full flex items-center justify-center text-xs font-bold text-primary shrink-0">{c.name.charAt(0)}</div>
                    <div>
                      <h3 className="font-medium text-sm">{c.name}</h3>
                      <p className="text-xs text-muted-foreground">{c.code} · {c.phone}</p>
                    </div>
                  </div>
                  <StatusBadge status={c.group} />
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t text-sm">
                  <span className="text-xs text-muted-foreground">{c.orderCount} đơn</span>
                  <span className="font-bold text-primary">{formatVND(c.totalPurchases)}</span>
                </div>
              </div>
            ))}
          </div>
          <TablePagination page={tc.page} totalPages={tc.totalPages} total={tc.total} rangeStart={tc.rangeStart} rangeEnd={tc.rangeEnd} pageSize={tc.pageSize} onPageChange={tc.setPage} onPageSizeChange={tc.setPageSize} />
        </>
      )}

      <CustomerFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} customer={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { customerActions.remove(deleting.id); toast.success("Đã xóa khách hàng"); } }}
        title="Xóa khách hàng?"
        description={`Bạn chắc chắn muốn xóa "${deleting?.name}"? Lịch sử đơn hàng sẽ vẫn được giữ lại.`}
        variant="danger"
        confirmLabel="Xóa"
      />
    </div>
  );
}
