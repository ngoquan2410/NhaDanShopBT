import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ImportPreviewDialog } from "@/components/shared/ImportPreviewDialog";
import { SortableTh } from "@/components/shared/SortableTh";
import { TablePagination } from "@/components/shared/TablePagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { AsyncBoundary } from "@/components/shared/AsyncBoundary";
import { useTableControls } from "@/hooks/useTableControls";
import { useService } from "@/hooks/useService";
import { products as productService, categories as categoryService } from "@/services";
import type { Product } from "@/lib/mock-data";
import { formatVND } from "@/lib/format";
import { useState, useRef, useEffect, useMemo } from "react";
import { Search, Plus, Package, MoreHorizontal, Upload, Pencil, Trash2, Power, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

function getStockSignal(product: Product) {
  const hasOutOfStock = product.variants.some(v => v.stock === 0);
  const hasLowStock = product.variants.some(v => v.stock > 0 && v.stock <= v.minStock);
  if (hasOutOfStock) return "out-of-stock" as const;
  if (hasLowStock) return "low-stock" as const;
  return "in-stock" as const;
}

export default function AdminProducts() {
  const navigate = useNavigate();
  const initialQ = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") ?? "" : "";
  const [search, setSearch] = useState(initialQ);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Service-driven list. Filtering by category is pushed to the adapter; the
  // free-text search stays client-side because the local adapter only matches
  // name+code and we want to keep behaviour identical to before.
  const { data, loading, error, isEmpty, reload } = useService(
    () => productService.list({
      pageSize: 1000,
      categoryId: filterCategory ?? undefined,
    }),
    [filterCategory],
  );

  // Categories now come from CategoryService — same store under the hood, but
  // the screen no longer reaches into useStore() directly.
  const { data: categoriesData } = useService(
    () => categoryService.list({ active: true }),
    [],
  );
  const categories = categoriesData?.items ?? [];

  const products = data?.items ?? [];

  const filtered = useMemo(() => products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, search]);

  type SortKey = "name" | "code" | "category" | "variants" | "stock" | "status" | "price";
  const tc = useTableControls<Product, SortKey>({
    data: filtered,
    pageSize: 20,
    initialSort: { key: "name", dir: "asc" },
    sortAccessors: {
      name: (p) => p.name,
      code: (p) => p.code,
      category: (p) => p.categoryName ?? "",
      variants: (p) => p.variants.length,
      stock: (p) => p.variants.reduce((s, v) => s + v.stock, 0),
      status: (p) => (p.active ? 1 : 0),
      price: (p) => {
        const dv = p.variants.find(v => v.isDefault) || p.variants[0];
        return dv?.sellPrice ?? 0;
      },
    },
    resetToken: `${search}|${filterCategory ?? ""}`,
  });

  const handleToggleActive = async (p: Product) => {
    await productService.update(p.id, { active: !p.active });
    reload();
    toast.success(p.active ? `Đã ngưng "${p.name}"` : `Đã kích hoạt "${p.name}"`);
    setOpenMenu(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await productService.remove(confirmDelete.id);
    reload();
    toast.success(`Đã xóa "${confirmDelete.name}"`);
  };

  // The import dialog now routes to /admin/products/new?mode=import where the user reviews + saves.

  return (
    <div className="space-y-4 admin-dense">
      <PageHeader
        title="Sản phẩm"
        description={`${data?.total ?? products.length} sản phẩm`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted transition-colors">
              <Upload className="h-3.5 w-3.5" /> Nhập Excel
            </button>
            <button onClick={() => navigate("/admin/products/new")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors">
              <Plus className="h-3.5 w-3.5" /> Thêm sản phẩm
            </button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên, mã sản phẩm..."
            className="w-full h-8 pl-9 pr-3 text-sm bg-card rounded-md border focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <button onClick={() => setFilterCategory(null)} className={cn("shrink-0 px-2.5 py-1 text-xs font-medium rounded-md border", !filterCategory ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
            Tất cả
          </button>
          {(() => {
            const seen = new Set<string>();
            return categories.filter(c => {
              if (!c.active) return false;
              const key = c.name.trim().toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            }).map(cat => (
              <button key={cat.id} onClick={() => setFilterCategory(cat.id)} className={cn("shrink-0 px-2.5 py-1 text-xs font-medium rounded-md border", filterCategory === cat.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}>
                {cat.name}
              </button>
            ));
          })()}
        </div>
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        isEmpty={!loading && !error && (isEmpty || filtered.length === 0)}
        data={tc.pageRows}
        onRetry={reload}
        emptyFallback={<EmptyState icon={Package} title="Chưa có sản phẩm" description="Thêm sản phẩm đầu tiên hoặc thử bộ lọc khác" />}
      >
        {(rows) => (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <SortableTh label="Sản phẩm" sortKey="name" sort={tc.sort} onSort={tc.toggleSort} />
                    <SortableTh label="Mã" sortKey="code" sort={tc.sort} onSort={tc.toggleSort} />
                    <SortableTh label="Danh mục" sortKey="category" sort={tc.sort} onSort={tc.toggleSort} />
                    <SortableTh label="Phân loại" sortKey="variants" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                    <SortableTh label="Tồn kho" sortKey="stock" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                    <SortableTh label="Trạng thái" sortKey="status" sort={tc.sort} onSort={tc.toggleSort} align="center" />
                    <SortableTh label="Giá bán" sortKey="price" sort={tc.sort} onSort={tc.toggleSort} align="right" />
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(product => {
                    const stockSignal = getStockSignal(product);
                    const dv = product.variants.find(v => v.isDefault) || product.variants[0];
                    const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);
                    return (
                      <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <button onClick={() => navigate(`/admin/products/${product.id}`)} className="flex items-center gap-2.5 text-left hover:text-primary">
                            <div className="h-9 w-9 bg-muted rounded-md flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                            <span className="font-medium">{product.name}</span>
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{product.code}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{product.categoryName}</td>
                        <td className="px-3 py-2.5 text-center">{product.variants.length}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className="font-medium">{totalStock}</span>
                            <StatusBadge status={stockSignal} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <StatusBadge status={product.active ? "active" : "inactive"} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">{dv ? formatVND(dv.sellPrice) : "—"}</td>
                        <td className="px-3 py-2.5 relative">
                          <button onClick={() => setOpenMenu(openMenu === product.id ? null : product.id)} className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {openMenu === product.id && (
                            <div ref={menuRef} className="absolute right-2 top-9 z-20 w-44 bg-popover border rounded-md shadow-lg py-1 animate-fade-in">
                              <button onClick={() => { navigate(`/admin/products/${product.id}`); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                                <Eye className="h-3.5 w-3.5" /> Xem chi tiết
                              </button>
                              <button onClick={() => { navigate(`/admin/products/${product.id}`); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                                <Pencil className="h-3.5 w-3.5" /> Sửa sản phẩm
                              </button>
                              <button onClick={() => handleToggleActive(product)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left">
                                <Power className="h-3.5 w-3.5" /> {product.active ? "Ngưng bán" : "Kích hoạt"}
                              </button>
                              <div className="my-1 border-t" />
                              <button onClick={() => { setConfirmDelete(product); setOpenMenu(null); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-danger-soft text-danger text-left">
                                <Trash2 className="h-3.5 w-3.5" /> Xóa sản phẩm
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {rows.map(product => {
                const stockSignal = getStockSignal(product);
                const dv = product.variants.find(v => v.isDefault) || product.variants[0];
                const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);
                return (
                  <div key={product.id} className="bg-card rounded-lg border p-3" onClick={() => navigate(`/admin/products/${product.id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-10 w-10 bg-muted rounded-md flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                        <div>
                          <h3 className="font-medium text-sm">{product.name}</h3>
                          <p className="text-xs text-muted-foreground">{product.code} · {product.categoryName}</p>
                        </div>
                      </div>
                      <StatusBadge status={product.active ? "active" : "inactive"} />
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={stockSignal} label={`Tồn: ${totalStock}`} />
                        <span className="text-xs text-muted-foreground">{product.variants.length} phân loại</span>
                      </div>
                      <span className="font-bold text-sm text-primary">{dv ? formatVND(dv.sellPrice) : "—"}</span>
                    </div>
                  </div>
                );
              })}
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
      </AsyncBoundary>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        variant="danger"
        title="Xóa sản phẩm"
        description={`Xóa "${confirmDelete?.name}" cùng tất cả phân loại? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
      />

      <ImportPreviewDialog open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
