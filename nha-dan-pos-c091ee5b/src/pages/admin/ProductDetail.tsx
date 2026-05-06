import { useState, useEffect, useRef, type DragEvent } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ProductImportReview } from "@/components/shared/ProductImportReview";
import { importStaging } from "@/lib/import-staging";
import { useService } from "@/hooks/useService";
import { categories as categoryService, products as productService } from "@/services";
import type { ProductVariant } from "@/lib/mock-data";
import { formatVND } from "@/lib/format";
import { resolveProductImage, MAX_IMAGE_BYTES } from "@/lib/product-image";
import { adminUploadImage } from "@/services/auth/adminApi";
import {
  ArrowLeft, Save, Plus, Pencil, Trash2, Upload, ImageIcon, Check, Star, X, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VariantForm {
  id?: string;
  code: string; name: string;
  sellUnit: string; importUnit: string; piecesPerImportUnit: number;
  sellPrice: number; costPrice: number;
  stock: number; minStock: number; expiryDays: number;
  isDefault: boolean;
  isSellable?: boolean;
}

const emptyVariant: VariantForm = {
  code: "", name: "",
  sellUnit: "Cái", importUnit: "Thùng", piecesPerImportUnit: 1,
  sellPrice: 0, costPrice: 0,
  stock: 0, minStock: 10, expiryDays: 0,
  isDefault: false, isSellable: true,
};

export default function AdminProductDetailRoute() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isImportMode = params.get("mode") === "import";
  const isNew = !id || id === "new";
  if (isImportMode && isNew) return <ImportRouteWrapper />;
  return <AdminProductDetail />;
}

function ImportRouteWrapper() {
  const navigate = useNavigate();
  const [stage] = useState(() => importStaging.takeProducts());
  useEffect(() => {
    if (!stage) navigate("/admin/products", { replace: true });
  }, [stage, navigate]);
  if (!stage) return null;
  return (
    <ProductImportReview
      filename={stage.filename}
      rows={stage.rows}
      onCancel={() => navigate("/admin/products")}
      onSaved={() => { /* handled inside */ }}
    />
  );
}

function AdminProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const { data: product, loading: productLoading, error: productError, reload: reloadProduct } = useService(
    () => isNew ? Promise.resolve(null) : productService.get(id!),
    [id, isNew],
  );
  const { data: categoryData } = useService(() => categoryService.list({ includeInactive: true }), []);
  const categories = categoryData?.items ?? [];

  const [activeTab, setActiveTab] = useState<"general" | "variants" | "images">("general");
  const [variantForm, setVariantForm] = useState<VariantForm | null>(null);
  const [confirmDeleteVariant, setConfirmDeleteVariant] = useState<ProductVariant | null>(null);

  // Product-level form state
  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [type, setType] = useState<"single" | "multi">(product?.type ?? "single");
  const [active, setActive] = useState(product?.active ?? true);

  useEffect(() => {
    if (!productLoading && !isNew && !product) {
      // product was deleted from another tab — bounce back
      navigate("/admin/products");
    }
  }, [isNew, product, productLoading, navigate]);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setCode(product.code);
    setCategoryId(product.categoryId);
    setType(product.type);
    setActive(product.active);
  }, [product]);

  const tabs = [
    { id: "general" as const, label: "Thông tin chung" },
    { id: "variants" as const, label: `Phân loại (${product?.variants.length || 0})` },
    { id: "images" as const, label: "Hình ảnh" },
  ];

  const handleSaveProduct = async () => {
    if (!name.trim() || !code.trim()) { toast.error("Vui lòng nhập tên và mã sản phẩm"); return; }
    if (!categoryId) { toast.error("Vui lòng chọn danh mục"); return; }
    const cat = categories.find(c => c.id === categoryId);
    try {
      if (isNew) {
        const created = await productService.create({
          code: code.trim(), name: name.trim(),
          categoryId, categoryName: cat?.name ?? "",
          image: "", active, type,
          variants: [],
        } as any);
        toast.success("Đã tạo sản phẩm mới");
        navigate(`/admin/products/${created.id}`, { replace: true });
      } else if (product) {
        await productService.update(product.id, {
          name: name.trim(), code: code.trim(),
          categoryId, categoryName: cat?.name ?? product.categoryName,
          type, active,
        });
        toast.success("Đã lưu thay đổi");
        reloadProduct();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể lưu sản phẩm");
    }
  };

  const openAddVariant = () => setVariantForm({ ...emptyVariant, isDefault: !product || product.variants.length === 0 });
  const openEditVariant = (v: ProductVariant) => setVariantForm({ ...v, isSellable: v.isSellable ?? true });

  const variantErrors = (() => {
    const e: Record<string, string> = {};
    if (!variantForm) return e;
    if (!variantForm.code.trim()) e.code = "Bắt buộc";
    if (!variantForm.name.trim()) e.name = "Bắt buộc";
    const numericFields: Array<[keyof VariantForm, string]> = [
      ["sellPrice", "Giá bán"], ["costPrice", "Giá nhập"],
      ["piecesPerImportUnit", "Số lượng/ĐV nhập"], ["stock", "Tồn kho hiện tại"],
      ["minStock", "Tồn kho tối thiểu"], ["expiryDays", "Số ngày hết hạn"],
    ];
    for (const [k, label] of numericFields) {
      const v = Number((variantForm as any)[k]);
      if (Number.isNaN(v)) e[k as string] = `${label} không hợp lệ`;
      else if (v < 0) e[k as string] = `${label} không được âm`;
    }
    if (!e.sellPrice && variantForm.isSellable !== false && variantForm.sellPrice <= 0) e.sellPrice = "Giá bán phải > 0";
    if (!e.piecesPerImportUnit && variantForm.piecesPerImportUnit <= 0) e.piecesPerImportUnit = "Phải > 0";
    return e;
  })();
  const variantHasErrors = Object.keys(variantErrors).length > 0;

  const handleSaveVariant = async () => {
    if (!product || !variantForm) return;
    if (variantHasErrors) { toast.error("Vui lòng sửa các trường không hợp lệ"); return; }
    try {
      if (variantForm.id) {
        await productService.updateVariant(product.id, variantForm.id, variantForm);
        toast.success("Đã cập nhật phân loại");
      } else {
        await productService.addVariant(product.id, variantForm);
        toast.success("Đã thêm phân loại mới");
      }
      setVariantForm(null);
      reloadProduct();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể lưu phân loại");
    }
  };

  const handleDeleteVariant = async () => {
    if (!product || !confirmDeleteVariant) return;
    if (product.variants.length === 1) {
      toast.error("Phải có ít nhất 1 phân loại");
      return;
    }
    try {
      await productService.removeVariant(product.id, confirmDeleteVariant.id);
      toast.success(`Đã xóa phân loại "${confirmDeleteVariant.name}"`);
      reloadProduct();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xóa phân loại");
    }
  };

  const handleSetDefault = async (v: ProductVariant) => {
    if (!product || v.isDefault) return;
    await productService.setDefaultVariant(product.id, v.id);
    toast.success(`Đặt "${v.name}" làm phân loại mặc định`);
    reloadProduct();
  };

  return (
    <div className="space-y-4 admin-dense pb-20 lg:pb-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/products" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Sản phẩm
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{isNew ? "Tạo sản phẩm" : product?.name}</span>
      </div>

      <PageHeader
        title={isNew ? "Tạo sản phẩm mới" : `${product?.name}`}
        description={isNew ? "Điền thông tin sản phẩm và phân loại" : `${product?.code} · ${product?.categoryName}`}
        actions={
          <div className="flex gap-2">
            {!isNew && <StatusBadge status={active ? "active" : "inactive"} size="md" />}
            <button onClick={handleSaveProduct} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
              <Save className="h-3.5 w-3.5" /> Lưu thay đổi
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn(
            "px-3 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Info */}
      {activeTab === "general" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-card rounded-lg border p-4 space-y-3">
            <h3 className="font-semibold text-sm">Thông tin cơ bản</h3>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tên sản phẩm *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Mì Hảo Hảo" className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mã sản phẩm *</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="VD: SP001" className="mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Danh mục *</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="mt-1 w-full h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">Chọn danh mục</option>
                {categories.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Chưa có danh mục nào.&nbsp;
                  <Link to="/admin/categories" className="text-primary font-medium hover:underline">
                    Tạo danh mục
                  </Link>
                  &nbsp;trước khi lưu sản phẩm.
                </p>
              )}
              {categories.length > 0 && categories.every((c) => !c.active) && (
                <p className="mt-1.5 text-[11px] text-warning">
                  Mọi danh mục đang tắt — kích hoạt một danh mục tại{" "}
                  <Link to="/admin/categories" className="font-medium underline">
                    Danh mục
                  </Link>
                  &nbsp;hoặc chọn “bao gồm không hoạt động” khi sửa.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Loại sản phẩm</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className="mt-1 w-full h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="single">Đơn giản (1 phân loại)</option>
                <option value="multi">Nhiều phân loại</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold text-sm mb-3">Trạng thái</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Kích hoạt sản phẩm</p>
                  <p className="text-xs text-muted-foreground">Sản phẩm sẽ hiển thị trên cửa hàng</p>
                </div>
                <button onClick={() => setActive(!active)} className={cn("w-10 h-5 rounded-full transition-colors relative", active ? "bg-success" : "bg-muted")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform", active ? "left-5" : "left-0.5")} />
                </button>
              </div>
            </div>

            {!isNew && product && (
              <div className="bg-card rounded-lg border p-4">
                <h3 className="font-semibold text-sm mb-2">Tổng quan tồn kho</h3>
                {product.variants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Chưa có phân loại nào.</p>
                ) : (
                  <div className="space-y-1.5">
                    {product.variants.map(v => (
                      <div key={v.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                        <span className="text-muted-foreground">{v.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{v.stock} {v.sellUnit}</span>
                          <StatusBadge status={v.stock === 0 ? "out-of-stock" : v.stock <= v.minStock ? "low-stock" : "in-stock"} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Variants */}
      {activeTab === "variants" && (
        <div className="space-y-3">
          {isNew && (
            <div className="p-3 rounded-md bg-warning-soft text-xs text-warning">
              Hãy lưu sản phẩm trước, sau đó quay lại tab này để thêm phân loại.
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Phân loại sản phẩm</p>
              <p className="text-xs text-muted-foreground">Phân loại (variant) là đơn vị tồn kho chính. Chỉ 1 phân loại được đặt mặc định.</p>
            </div>
            <button
              onClick={openAddVariant}
              disabled={isNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm phân loại
            </button>
          </div>

          {variantForm && (
            <div className="bg-card rounded-lg border p-4 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{variantForm.id ? "Sửa phân loại" : "Thêm phân loại mới"}</h3>
                <button onClick={() => setVariantForm(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Mã phân loại *", "code", "text", "VD: SP001-04"],
                  ["Tên phân loại *", "name", "text", "VD: Hương bò"],
                  ["Đơn vị bán", "sellUnit", "text", "VD: Gói"],
                  ["Đơn vị nhập", "importUnit", "text", "VD: Thùng"],
                  ["Số lượng/ĐV nhập", "piecesPerImportUnit", "number", "30"],
                  ["Giá bán *", "sellPrice", "number", "5000"],
                  ["Giá nhập", "costPrice", "number", "3500"],
                  ["Tồn kho hiện tại", "stock", "number", "0"],
                  ["Tồn kho tối thiểu", "minStock", "number", "50"],
                  ["Số ngày hết hạn", "expiryDays", "number", "180"],
                ].map(([label, key, t, ph]) => {
                  const k = key as string;
                  const isNum = t === "number";
                  const err = variantErrors[k];
                  return (
                    <div key={k}>
                      <label className="text-xs font-medium text-muted-foreground">{label}</label>
                      <input
                        type={t as string}
                        min={isNum ? 0 : undefined}
                        value={(variantForm as any)[k] as any}
                        onChange={e => {
                          const raw = e.target.value;
                          const next = isNum ? Math.max(0, Number(raw) || 0) : raw;
                          setVariantForm({ ...variantForm, [k]: next });
                        }}
                        placeholder={ph as string}
                        className={cn(
                          "mt-1 w-full h-8 px-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring",
                          k === "code" && "font-mono",
                          err && "border-danger focus:ring-danger"
                        )}
                      />
                      {err && <p className="mt-0.5 text-[11px] text-danger">{err}</p>}
                    </div>
                  );
                })}
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer rounded-md border bg-muted/30 px-3 py-2 w-full hover:bg-muted/50 transition-colors h-9">
                    <input type="checkbox" checked={variantForm.isDefault} onChange={e => setVariantForm({ ...variantForm, isDefault: e.target.checked })} className="h-4 w-4 rounded border-input accent-primary" />
                    Đặt làm phân loại mặc định
                  </label>
                </div>
                <div className="rounded-md border bg-muted/30 p-3 sm:col-span-2 lg:col-span-1">
                  <label className="flex items-start gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={variantForm.isSellable !== false}
                      onChange={(e) => setVariantForm({ ...variantForm, isSellable: e.target.checked })}
                      className="h-4 w-4 mt-0.5 rounded border-input accent-primary shrink-0"
                    />
                    <span className="flex-1">
                      <span className="block">Bán lẻ / hiển thị cửa hàng</span>
                      <span className="mt-1 block text-[11px] font-normal text-muted-foreground leading-snug">
                        Tắt nếu đây là NVL/quy cách chỉ nhập kho; khi tắt có thể để giá bán bằng 0.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-3 items-center">
                <button
                  onClick={handleSaveVariant}
                  disabled={variantHasErrors}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="h-3 w-3" /> Lưu
                </button>
                <button onClick={() => setVariantForm(null)} className="px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-muted">Hủy</button>
                {variantHasErrors && <span className="text-[11px] text-danger">Còn {Object.keys(variantErrors).length} trường chưa hợp lệ</span>}
              </div>
            </div>
          )}

          {product && product.variants.length > 0 && (
            <div className="bg-card rounded-lg border overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-10">Mặc định</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mã</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tên</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">ĐV bán</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">ĐV nhập</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giá bán</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Giá nhập</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Tồn</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Min</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">HSD</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map(v => {
                    const stockStatus = v.stock === 0 ? "out-of-stock" : v.stock <= v.minStock ? "low-stock" : "in-stock";
                    return (
                      <tr key={v.id} className={cn("border-b last:border-0 hover:bg-muted/30 transition-colors", stockStatus === "out-of-stock" && "bg-danger-soft/30", stockStatus === "low-stock" && "bg-warning-soft/30")}>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => handleSetDefault(v)} title={v.isDefault ? "Phân loại mặc định" : "Đặt làm mặc định"} className={cn("inline-flex p-1 rounded hover:bg-muted", v.isDefault ? "text-accent" : "text-muted-foreground/30 hover:text-muted-foreground")}>
                            <Star className={cn("h-3.5 w-3.5", v.isDefault && "fill-accent")} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs">{v.code}</td>
                        <td className="px-3 py-2.5 font-medium">
                          <div>{v.name}</div>
                          <span className={cn(
                            "mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            v.isSellable === false ? "bg-muted text-muted-foreground" : "bg-success-soft text-success",
                          )}>
                            {v.isSellable === false ? "NVL" : "Bán lẻ"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{v.sellUnit}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{v.importUnit} ({v.piecesPerImportUnit})</td>
                        <td className="px-3 py-2.5 text-right font-medium">{formatVND(v.sellPrice)}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{formatVND(v.costPrice)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-medium">{v.stock}</span>
                            <StatusBadge status={stockStatus} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{v.minStock}</td>
                        <td className="px-3 py-2.5 text-center text-muted-foreground">{v.expiryDays > 0 ? `${v.expiryDays} ngày` : "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditVariant(v)} title="Sửa" className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"><Pencil className="h-3 w-3" /></button>
                            <button onClick={() => setConfirmDeleteVariant(v)} title="Xóa" className="p-1 text-muted-foreground hover:text-danger rounded hover:bg-muted"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {product && product.variants.length === 0 && !variantForm && (
            <div className="bg-card border rounded-lg p-8 text-center">
              <p className="text-sm text-muted-foreground">Chưa có phân loại nào. Hãy thêm ít nhất 1 phân loại để bán sản phẩm này.</p>
            </div>
          )}
        </div>
      )}

      {/* Images */}
      {activeTab === "images" && product && (
        <ImagesTab product={product} reloadProduct={reloadProduct} />
      )}
      {activeTab === "images" && !product && (
        <div className="bg-card rounded-lg border p-6 text-sm text-muted-foreground">
          Hãy lưu sản phẩm trước, sau đó quay lại tab này để tải ảnh lên.
        </div>
      )}

      {/* Mobile sticky save */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-card border-t lg:hidden z-30">
        <button onClick={handleSaveProduct} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground">
          <Save className="h-4 w-4" /> Lưu thay đổi
        </button>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteVariant}
        onClose={() => setConfirmDeleteVariant(null)}
        onConfirm={handleDeleteVariant}
        variant="danger"
        title="Xóa phân loại"
        description={`Xóa phân loại "${confirmDeleteVariant?.name}" (${confirmDeleteVariant?.code})? Tồn kho hiện tại sẽ bị mất.`}
        confirmLabel="Xóa"
      />
    </div>
  );
}

// ===== Images Tab =====
function ImagesTab({ product, reloadProduct }: { product: ProductDetailData; reloadProduct: () => void }) {
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null);
  const [productImageBroken, setProductImageBroken] = useState(false);

  useEffect(() => {
    setProductImageBroken(false);
  }, [product.image]);

  const validateImageFile = (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Ảnh vượt quá 5MB");
      return false;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ chấp nhận file ảnh");
      return false;
    }
    return true;
  };

  const handleProductFile = async (file: File | null) => {
    if (!file || !validateImageFile(file)) return;
    setUploadingProductImage(true);
    try {
      const { url } = await adminUploadImage(file);
      await productService.update(product.id, { image: url });
      reloadProduct();
      toast.success("Đã cập nhật ảnh sản phẩm");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không upload được ảnh";
      toast.error(msg.includes("503") || msg.includes("R2") ? `${msg} — nhập URL ảnh thủ công ở tab Thông tin chung.` : msg);
    } finally {
      setUploadingProductImage(false);
    }
  };

  const handleVariantFile = async (variantId: string, file: File | null) => {
    if (!file || !validateImageFile(file)) return;
    setUploadingVariantId(variantId);
    try {
      const { url } = await adminUploadImage(file);
      await productService.updateVariant(product.id, variantId, { image: url });
      reloadProduct();
      toast.success("Đã cập nhật ảnh phân loại");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Không upload được ảnh";
      toast.error(msg.includes("503") || msg.includes("R2") ? `${msg} — nhập URL ảnh thủ công trong sửa phân loại.` : msg);
    } finally {
      setUploadingVariantId(null);
    }
  };

  const clearProductImage = () => {
    void productService.update(product.id, { image: "" }).then(() => { reloadProduct(); });
    toast.success("Đã xóa ảnh sản phẩm");
  };

  const clearVariantImage = (variantId: string) => {
    void productService.updateVariant(product.id, variantId, { image: "" }).then(() => { reloadProduct(); });
    toast.success("Đã xóa ảnh riêng");
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg border p-5">
        <div className="mx-auto max-w-xl text-center">
          <h3 className="font-semibold text-sm">Ảnh sản phẩm (mặc định)</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Dùng cho mọi phân loại trừ khi phân loại có ảnh riêng. Khuyến nghị tỉ lệ vuông, tối đa 5MB.
          </p>
          <div className="mt-4">
            <ImageUploadDropzone
              title={product.image ? "Thay ảnh sản phẩm" : "Tải ảnh sản phẩm"}
              imageUrl={product.image}
              alt={product.name}
              uploading={uploadingProductImage}
              broken={productImageBroken}
              onBroken={() => setProductImageBroken(true)}
              onUpload={handleProductFile}
              onClear={product.image ? clearProductImage : undefined}
            />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-5">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h3 className="font-semibold text-sm">Ảnh riêng cho phân loại (tùy chọn)</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Nếu phân loại có ảnh riêng, hệ thống sẽ ưu tiên ảnh này. Nếu không, phân loại dùng ảnh sản phẩm mặc định.
            </p>
          </div>
          {product.variants.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center">Chưa có phân loại nào.</p>
          ) : (
            <div
              className={cn(
                "grid gap-4 justify-center",
                product.variants.length === 1
                  ? "grid-cols-1 max-w-xs mx-auto"
                  : product.variants.length === 2
                  ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              )}
            >
              {product.variants.map((v) => (
                <VariantImageCard
                  key={v.id}
                  variant={v}
                  fallback={product.image}
                  onUpload={(file) => handleVariantFile(v.id, file)}
                  onClear={() => clearVariantImage(v.id)}
                  uploading={uploadingVariantId === v.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantImageCard({
  variant,
  fallback,
  onUpload,
  onClear,
  uploading,
}: {
  variant: ProductVariant;
  fallback: string;
  onUpload: (file: File | null) => void;
  onClear: () => void;
  uploading: boolean;
}) {
  const hasOverride = !!variant.image;
  const display = variant.image || fallback;
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [display]);

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 text-left">
          <p className="truncate text-xs font-medium">{variant.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{variant.code}</p>
        </div>
        <span className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
          hasOverride ? "bg-info-soft text-info" : "bg-muted text-muted-foreground"
        )}>
          {hasOverride ? "Riêng" : "Mặc định"}
        </span>
      </div>
      <ImageUploadDropzone
        title={hasOverride ? "Thay ảnh" : "Tải ảnh"}
        imageUrl={display}
        alt={variant.name}
        uploading={uploading}
        broken={broken}
        onBroken={() => setBroken(true)}
        onUpload={onUpload}
        onClear={hasOverride ? onClear : undefined}
        compact
      />
    </div>
  );
}

function ImageUploadDropzone({
  title,
  imageUrl,
  alt,
  uploading,
  broken,
  onBroken,
  onUpload,
  onClear,
  compact = false,
}: {
  title: string;
  imageUrl?: string;
  alt: string;
  uploading: boolean;
  broken: boolean;
  onBroken: () => void;
  onUpload: (file: File | null) => void;
  onClear?: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const chooseFile = () => inputRef.current?.click();
  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    onUpload(event.dataTransfer.files?.[0] ?? null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={chooseFile}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        disabled={uploading}
        className={cn(
          "group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/20 text-center transition focus:outline-none focus:ring-2 focus:ring-primary/30",
          compact ? "aspect-square" : "aspect-square max-h-[320px] min-h-[220px]",
          dragging ? "border-primary bg-primary/5" : "hover:border-primary hover:bg-muted/30",
          uploading && "cursor-wait opacity-70"
        )}
      >
        {imageUrl && !broken ? (
          <img src={imageUrl} alt={alt} onError={onBroken} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-muted-foreground">
            {uploading ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImageIcon className="h-8 w-8" />}
            <span className="text-xs font-medium text-foreground">{uploading ? "Đang tải ảnh..." : title}</span>
            <span className="text-[11px]">Click hoặc kéo thả ảnh vào khung</span>
            {imageUrl && broken ? <span className="text-[11px] text-danger">Không tải được ảnh hiện tại</span> : null}
          </div>
        )}
        {imageUrl && !broken && !uploading ? (
          <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-2 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            Click để thay ảnh
          </span>
        ) : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onUpload(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={chooseFile}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Đang tải" : title}
        </button>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-danger hover:bg-muted disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa ảnh
          </button>
        ) : null}
      </div>
    </div>
  );
}
