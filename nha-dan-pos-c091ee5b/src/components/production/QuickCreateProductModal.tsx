import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { products as productService, categories as categoryService } from "@/services";
import type { Product } from "@/lib/catalog-types";

export type QuickCreateMode = "material" | "finished";

interface Props {
  open: boolean;
  mode: QuickCreateMode;
  initialKeyword?: string;
  onClose: () => void;
  onCreated: (product: Product) => void;
}

/**
 * Quick-create modal for materials (isSellable=false) or finished products
 * (isSellable=true). Master data only — does NOT touch stock or batches.
 */
export function QuickCreateProductModal({ open, mode, initialKeyword, onClose, onCreated }: Props) {
  const isMaterial = mode === "material";
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockUnit, setStockUnit] = useState(isMaterial ? "g" : "cái");
  const [importUnit, setImportUnit] = useState(isMaterial ? "kg" : "thùng");
  const [piecesPerImport, setPiecesPerImport] = useState(isMaterial ? 1000 : 12);
  const [expiryDays, setExpiryDays] = useState<number | "">("");
  const [costPrice, setCostPrice] = useState<number | "">("");
  const [sellPrice, setSellPrice] = useState<number | "">("");
  const [isSellable, setIsSellable] = useState<boolean>(!isMaterial);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(initialKeyword?.trim() ?? "");
    setCode("");
    setCategoryId("");
    setExpiryDays("");
    setCostPrice("");
    setSellPrice("");
    setIsSellable(!isMaterial);
    setErrors({});
    void categoryService.list({ active: true }).then((p) => setCategories(p.items.map((c) => ({ id: c.id, name: c.name }))));
  }, [open, initialKeyword, isMaterial]);

  if (!open) return null;

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Vui lòng nhập tên";
    if (!code.trim()) errs.code = "Vui lòng nhập mã";
    if (!categoryId) errs.categoryId = "Chọn danh mục";
    if (!stockUnit.trim()) errs.stockUnit = "Bắt buộc";
    if (!importUnit.trim()) errs.importUnit = "Bắt buộc";
    if (!piecesPerImport || piecesPerImport <= 0) errs.piecesPerImport = "Tỷ lệ phải > 0";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const cat = categories.find((c) => c.id === categoryId);
      const created = await productService.create({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        categoryId,
        categoryName: cat?.name ?? "",
        image: "",
        active: true,
        type: "single",
        variants: [
          {
            id: "",
            code: code.trim().toUpperCase(),
            name: name.trim(),
            sellUnit: isMaterial ? stockUnit : (importUnit || stockUnit),
            importUnit,
            piecesPerImportUnit: Number(piecesPerImport),
            sellPrice: Number(sellPrice) || 0,
            costPrice: Number(costPrice) || 0,
            stock: 0,
            minStock: 0,
            expiryDays: Number(expiryDays) || 0,
            isDefault: true,
            isSellable, // mặc định theo mode, có thể bật/tắt qua switch
          },
        ],
      });
      toast.success(isMaterial ? "Đã tạo nguyên liệu" : "Đã tạo thành phẩm");
      onCreated(created);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được — kiểm tra mã trùng");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">
              {isMaterial ? "Tạo nhanh nguyên liệu" : "Tạo nhanh thành phẩm"}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Loại: {isMaterial ? "Nguyên liệu" : "Thành phẩm"} · Bán trên storefront: {isSellable ? "Bật" : "Tắt"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <Field label={isMaterial ? "Tên nguyên liệu" : "Tên thành phẩm"} error={errors.name} required>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-9 px-3 text-sm border rounded-md" />
          </Field>
          <Field label={isMaterial ? "Mã nguyên liệu" : "Mã thành phẩm"} error={errors.code} required>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-full h-9 px-3 text-sm border rounded-md font-mono" />
          </Field>
          <Field label="Danh mục" error={errors.categoryId} required>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full h-9 px-3 text-sm border rounded-md bg-background">
              <option value="">— Chọn danh mục —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Đơn vị tồn kho" error={errors.stockUnit} required>
              <input value={stockUnit} onChange={(e) => setStockUnit(e.target.value)} className="w-full h-9 px-3 text-sm border rounded-md" />
            </Field>
            <Field label={isMaterial ? "Đơn vị nhập" : "Đơn vị bán"} error={errors.importUnit} required>
              <input value={importUnit} onChange={(e) => setImportUnit(e.target.value)} className="w-full h-9 px-3 text-sm border rounded-md" />
            </Field>
          </div>
          {isMaterial && (
            <Field label={`Tỷ lệ quy đổi (1 ${importUnit || "ĐV nhập"} = ? ${stockUnit || "ĐV tồn"})`} error={errors.piecesPerImport} required>
              <input type="number" min={1} value={piecesPerImport} onChange={(e) => setPiecesPerImport(Number(e.target.value) || 1)} className="w-full h-9 px-3 text-sm border rounded-md" />
            </Field>
          )}
          <Field label="Hạn sử dụng chuẩn (ngày)" hint="Tùy chọn">
            <input type="number" min={0} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} className="w-full h-9 px-3 text-sm border rounded-md" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {!isMaterial && (
              <Field label="Giá bán (₫)" hint="Tùy chọn">
                <input type="number" min={0} value={sellPrice} onChange={(e) => setSellPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} className="w-full h-9 px-3 text-sm border rounded-md" />
              </Field>
            )}
            <Field label="Giá vốn tham khảo (₫)" hint="Tùy chọn">
              <input type="number" min={0} value={costPrice} onChange={(e) => setCostPrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} className="w-full h-9 px-3 text-sm border rounded-md" />
            </Field>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={isSellable}
                onClick={() => setIsSellable((v) => !v)}
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isSellable ? "bg-success" : "bg-muted-foreground/40"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform ${isSellable ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <div className="flex-1">
                <p className="text-xs font-semibold">Bán lẻ / hiển thị cửa hàng</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  {isSellable
                    ? "Sản phẩm có thể bán trên storefront/POS, cần giá vốn tham khảo."
                    : "Nguyên liệu nội bộ, không bán lẻ."}
                </p>
              </div>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2 leading-relaxed">
            Tạo nhanh chỉ tạo master data — không tạo lô, không tăng tồn kho.
          </p>
        </div>

        <div className="p-4 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 h-9 text-sm border rounded-md hover:bg-muted">Hủy</button>
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isMaterial ? "Tạo nguyên liệu" : "Tạo thành phẩm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, error, hint, required }: { label: string; children: React.ReactNode; error?: string; hint?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}{required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-danger mt-1">{error}</p>}
      {!error && hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
