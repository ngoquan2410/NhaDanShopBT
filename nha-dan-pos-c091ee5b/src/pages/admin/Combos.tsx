import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTableToolbar } from "@/components/shared/DataTableToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { SortableTh } from "@/components/shared/SortableTh";
import { TablePagination } from "@/components/shared/TablePagination";
import { useTableControls } from "@/hooks/useTableControls";
import { useStore, comboActions, computeDerivedStock } from "@/lib/store";
import type { Combo, ComboItem } from "@/lib/mock-data";
import { formatVND } from "@/lib/format";
import { Plus, Layers, Package, Pencil, AlertTriangle, Info, Trash2, X, Check, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ComboForm {
  id?: string;
  code: string; name: string; price: number; active: boolean;
  components: ComboItem[];
}

const emptyForm: ComboForm = { code: "", name: "", price: 0, active: true, components: [] };

export default function AdminCombos() {
  const { combos, products } = useStore();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ComboForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Combo | null>(null);

  const filtered = useMemo(() => combos.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  ), [combos, search]);

  type SortKey = "name" | "code" | "components" | "stock" | "price" | "status";
  const tc = useTableControls<Combo, SortKey>({
    data: filtered,
    pageSize: 20,
    initialSort: { key: "name", dir: "asc" },
    sortAccessors: {
      name: (c) => c.name,
      code: (c) => c.code,
      components: (c) => c.components.length,
      stock: (c) => c.derivedStock,
      price: (c) => c.price,
      status: (c) => (c.active ? 1 : 0),
    },
    resetToken: search,
  });

  const openCreate = () => setForm({ ...emptyForm });
  const openEdit = (c: Combo) => setForm({ id: c.id, code: c.code, name: c.name, price: c.price, active: c.active, components: [...c.components] });

  const handleSave = () => {
    if (!form) return;
    if (!form.code.trim() || !form.name.trim()) { toast.error("Nhập mã và tên combo"); return; }
    if (form.price <= 0) { toast.error("Giá combo phải lớn hơn 0"); return; }
    if (form.components.length === 0) { toast.error("Combo cần ít nhất 1 sản phẩm thành phần"); return; }
    if (form.components.some(c => c.quantity <= 0)) { toast.error("Số lượng thành phần phải lớn hơn 0"); return; }

    if (form.id) {
      comboActions.update(form.id, { code: form.code.trim(), name: form.name.trim(), price: form.price, active: form.active, components: form.components });
      toast.success("Đã cập nhật combo");
    } else {
      comboActions.create({ code: form.code.trim(), name: form.name.trim(), price: form.price, active: form.active, components: form.components });
      toast.success("Đã tạo combo mới");
    }
    setForm(null);
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    comboActions.remove(confirmDelete.id);
    toast.success(`Đã xóa "${confirmDelete.name}"`);
  };

  const handleToggle = (c: Combo) => {
    comboActions.update(c.id, { active: !c.active });
    toast.success(c.active ? `Đã ngưng "${c.name}"` : `Đã kích hoạt "${c.name}"`);
  };

  // ===== Form helpers =====
  const addComponent = () => {
    if (!form) return;
    const firstProduct = products[0];
    const firstVariant = firstProduct?.variants[0];
    if (!firstProduct || !firstVariant) { toast.error("Chưa có sản phẩm để thêm"); return; }
    setForm({
      ...form,
      components: [...form.components, {
        productId: firstProduct.id, variantId: firstVariant.id,
        productName: firstProduct.name, variantName: firstVariant.name,
        quantity: 1, stock: firstVariant.stock,
      }],
    });
  };

  const updateComponent = (idx: number, productId: string, variantId: string) => {
    if (!form) return;
    const product = products.find(p => p.id === productId);
    const variant = product?.variants.find(v => v.id === variantId);
    if (!product || !variant) return;
    const next = [...form.components];
    next[idx] = { ...next[idx], productId, variantId, productName: product.name, variantName: variant.name, stock: variant.stock };
    setForm({ ...form, components: next });
  };

  const updateQty = (idx: number, qty: number) => {
    if (!form) return;
    const next = [...form.components];
    next[idx] = { ...next[idx], quantity: qty };
    setForm({ ...form, components: next });
  };

  const removeComponent = (idx: number) => {
    if (!form) return;
    setForm({ ...form, components: form.components.filter((_, i) => i !== idx) });
  };

  const previewStock = form ? computeDerivedStock(form.components) : 0;

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Combo"
        description={`${combos.length} combo`}
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
            <Plus className="h-3.5 w-3.5" /> Tạo combo
          </button>
        }
      />

      <div className="flex items-center gap-2 p-2.5 bg-info-soft rounded-lg text-xs text-info">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>Combo không có tồn kho riêng. Tồn kho combo được tính từ sản phẩm thành phần.</span>
      </div>

      <DataTableToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Tìm combo..." />

      {form && (
        <div className="bg-card rounded-lg border p-4 animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">{form.id ? "Sửa combo" : "Tạo combo mới"}</h3>
            <button onClick={() => setForm(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mã combo *</label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="VD: CB001" className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tên combo *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="VD: Combo Gia Đình" className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Giá combo (VND) *</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} placeholder="120000" className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="h-3.5 w-3.5" />
                Kích hoạt combo
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold">Sản phẩm thành phần</label>
              <div className="flex items-center gap-3">
                <StatusBadge
                  status={previewStock === 0 ? "out-of-stock" : previewStock <= 5 ? "low-stock" : "in-stock"}
                  label={`Tồn kho dự kiến: ${previewStock}`}
                />
                <button onClick={addComponent} className="flex items-center gap-1 px-2 py-1 text-xs font-medium border rounded-md hover:bg-muted">
                  <Plus className="h-3 w-3" /> Thêm thành phần
                </button>
              </div>
            </div>
            {form.components.length === 0 ? (
              <div className="border border-dashed rounded-md p-6 text-center text-xs text-muted-foreground">
                Chưa có thành phần nào. Combo cần ít nhất 1 sản phẩm.
              </div>
            ) : (
              <div className="space-y-2">
                {form.components.map((c, i) => {
                  const product = products.find(p => p.id === c.productId);
                  const lowRatio = c.quantity > 0 ? Math.floor(c.stock / c.quantity) : 0;
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-muted/30 p-2 rounded-md">
                      <select
                        value={c.productId}
                        onChange={e => {
                          const p = products.find(x => x.id === e.target.value);
                          updateComponent(i, e.target.value, p?.variants[0]?.id ?? "");
                        }}
                        className="col-span-4 h-8 px-2 text-sm border rounded-md bg-background"
                      >
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <select
                        value={c.variantId}
                        onChange={e => updateComponent(i, c.productId, e.target.value)}
                        className="col-span-3 h-8 px-2 text-sm border rounded-md bg-background"
                      >
                        {product?.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">SL:</span>
                        <input type="number" min={1} value={c.quantity} onChange={e => updateQty(i, Number(e.target.value))} className="w-full h-8 px-2 text-sm border rounded-md bg-background" />
                      </div>
                      <div className="col-span-2 text-xs text-muted-foreground">
                        Tồn: {c.stock} → đủ <span className="font-medium text-foreground">{lowRatio}</span> combo
                      </div>
                      <button onClick={() => removeComponent(i)} title="Xóa" className="col-span-1 justify-self-end p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Lưu ý: Combo không thể chứa combo khác.</p>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md"><Check className="h-3 w-3" /> Lưu</button>
            <button onClick={() => setForm(null)} className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">Hủy</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Layers} title="Chưa có combo" description="Tạo combo để bán gộp nhiều sản phẩm" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <SortableTh label="Combo" sortKey="name" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Mã" sortKey="code" sort={tc.sort} onSort={tc.toggleSort} />
                  <SortableTh label="Thành phần" sortKey="components" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                  <SortableTh label="Tồn kho" sortKey="stock" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                  <SortableTh label="Giá combo" sortKey="price" sort={tc.sort} onSort={tc.toggleSort} align="right" />
                  <SortableTh label="Trạng thái" sortKey="status" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {tc.pageRows.map(combo => {
                  const hasLowComponent = combo.components.some(c => c.stock < 10);
                  return (
                    <tr key={combo.id} className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors", combo.derivedStock === 0 && "bg-danger-soft/30")}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 bg-accent-soft rounded-md flex items-center justify-center shrink-0"><Layers className="h-4 w-4 text-accent" /></div>
                          <span className="font-medium">{combo.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{combo.code}</td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span>{combo.components.length} SP</span>
                          {hasLowComponent && <AlertTriangle className="h-3 w-3 text-warning" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={combo.derivedStock === 0 ? "out-of-stock" : combo.derivedStock <= 5 ? "low-stock" : "in-stock"} label={`${combo.derivedStock}`} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">{formatVND(combo.price)}</td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={combo.active ? "active" : "inactive"} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => handleToggle(combo)} title={combo.active ? "Ngưng" : "Kích hoạt"} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openEdit(combo)} title="Sửa" className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete(combo)} title="Xóa" className="p-1.5 text-muted-foreground hover:text-danger rounded hover:bg-muted">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {tc.pageRows.map(combo => (
              <div key={combo.id} className="bg-card rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-sm">{combo.name}</h3>
                    <p className="text-xs text-muted-foreground">{combo.code} · {combo.components.length} sản phẩm</p>
                  </div>
                  <StatusBadge status={combo.active ? "active" : "inactive"} />
                </div>
                <div className="mt-2 pt-2 border-t flex items-center justify-between">
                  <StatusBadge status={combo.derivedStock === 0 ? "out-of-stock" : combo.derivedStock <= 5 ? "low-stock" : "in-stock"} label={`Tồn: ${combo.derivedStock}`} />
                  <span className="font-bold text-sm text-primary">{formatVND(combo.price)}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {combo.components.map((c, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" /> {c.productName} - {c.variantName} × {c.quantity}
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t flex gap-2">
                  <button onClick={() => openEdit(combo)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium border rounded-md">
                    <Pencil className="h-3 w-3" /> Sửa
                  </button>
                  <button onClick={() => setConfirmDelete(combo)} className="flex items-center justify-center gap-1 py-1.5 px-3 text-xs font-medium border border-danger/30 text-danger rounded-md">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <TablePagination
            page={tc.page}
            totalPages={tc.totalPages}
            pageSize={tc.pageSize}
            onPageChange={tc.setPage}
            onPageSizeChange={tc.setPageSize}
            rangeStart={tc.rangeStart}
            rangeEnd={tc.rangeEnd}
            total={tc.total}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Xóa combo"
        description={`Xóa combo "${confirmDelete?.name}"? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
      />
    </div>
  );
}
