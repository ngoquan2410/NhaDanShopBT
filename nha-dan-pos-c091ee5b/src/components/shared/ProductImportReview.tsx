import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  FileSpreadsheet, Loader2, Package, Plus, RefreshCw, Save, Search, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { useService } from "@/hooks/useService";
import { categories as categoryService, products as productService } from "@/services";
import { productImportRowSellableLabel, type ProductImportRow } from "@/lib/import-types";
import type { Category } from "@/lib/mock-data";
import { findCategoryByImportedName, isImportedCategoryNew } from "@/lib/categoryImportMatch";
import { buildVariantsForProductImportCreate } from "@/lib/productImportSavePayload";

interface DraftVariant {
  code: string;
  name: string;
  sellPrice: number;
  costPrice: number;
  stock: number;
  sellUnit: string;
  importUnit: string;
  piecesPerImportUnit: number;
  expiryDays: number;
  minStock: number;
  active: boolean;
  note: string;
  isSellable?: boolean;
  isSellableInvalid?: boolean;
}

interface DraftProduct {
  key: string;
  sourceRow: number;
  originalMessage?: string;
  code: string;
  name: string;
  category: string;
  variants: DraftVariant[];
  removed?: boolean;
  edited?: boolean;
}

interface VariantIssue { errors: string[]; warnings: string[]; }
interface DraftIssue { errors: string[]; warnings: string[]; variants: VariantIssue[]; }

interface Props {
  filename: string;
  rows: ProductImportRow[];
  onCancel: () => void;
  onSaved: () => void;
}

type StatusFilter = "all" | "error" | "warning" | "ok" | "edited";

const PRODUCT_IMPORT_SAVE_TOAST_ID = "product-import-save";

function createDrafts(rows: ProductImportRow[]): DraftProduct[] {
  return rows.map((row, index) => ({
    key: `${row.code || "NEW"}-${row.sourceRow}-${index}`,
    sourceRow: row.sourceRow,
    originalMessage: row.message,
    code: row.code,
    name: row.name,
    category: row.category,
    variants: [{
      code: row.variantCode || row.code,
      name: row.variantName || row.name || "Mặc định",
      sellPrice: row.sellPrice,
      costPrice: row.costPrice,
      stock: row.stock,
      sellUnit: row.sellUnit,
      importUnit: row.importUnit || row.sellUnit,
      piecesPerImportUnit: row.piecesPerImportUnit || 1,
      expiryDays: row.expiryDays || 0,
      minStock: row.minStock || 5,
      active: row.active,
      note: row.note,
      isSellable: row.isSellable ?? true,
      isSellableInvalid: row.isSellableInvalid,
    }],
  }));
}

function normalizeToken(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
}

function generateProductCode(name: string, category: string, usedCodes: Set<string>) {
  const base = (normalizeToken(category).slice(0, 3) + normalizeToken(name).slice(0, 5) || "SP").slice(0, 8) || "SP";
  let attempt = base;
  let counter = 1;
  while (!attempt || usedCodes.has(attempt)) {
    attempt = `${base.slice(0, 6)}${String(counter).padStart(2, "0")}`;
    counter += 1;
  }
  usedCodes.add(attempt);
  return attempt;
}

function validateDraft(
  draft: DraftProduct,
  existingCodes: Set<string>,
  duplicateCodes: Set<string>,
  categories: Category[],
): DraftIssue {
  const errors: string[] = [];
  const warnings: string[] = [];
  const variants = draft.variants.map<VariantIssue>((variant, index) => {
    const ve: string[] = []; const vw: string[] = [];
    if (!variant.name.trim()) ve.push("Thiếu tên phân loại.");
    const saleable = variant.isSellable !== false;
    if (!Number.isFinite(variant.sellPrice)) ve.push("Giá bán không hợp lệ.");
    else if (variant.sellPrice < 0) ve.push("Giá bán không được âm.");
    else if (saleable && variant.sellPrice === 0) ve.push("Giá bán phải > 0 (VND) khi bán hàng.");
    if (!Number.isFinite(variant.costPrice)) ve.push("Giá vốn không hợp lệ.");
    else if (variant.costPrice < 0) ve.push("Giá vốn không được âm.");
    else if (saleable && variant.costPrice === 0) ve.push("Giá vốn phải > 0 (VND) khi bán hàng.");
    if (!variant.sellUnit.trim()) ve.push("Thiếu đơn vị bán.");
    if (!variant.importUnit.trim()) vw.push("Thiếu ĐV nhập — sẽ dùng ĐV bán.");
    if (variant.piecesPerImportUnit <= 0) ve.push("Quy đổi phải > 0.");
    if (variant.minStock < 0) ve.push("Tồn min không hợp lệ.");
    if (variant.stock < 0) ve.push("Tồn đầu không hợp lệ.");
    if (variant.isSellableInvalid) ve.push("Cột bán hàng (N) từ Excel không hợp lệ.");
    if (variant.costPrice > 0 && variant.sellPrice > 0 && variant.sellPrice < variant.costPrice) vw.push("Giá bán < giá vốn.");
    if (!variant.code.trim()) {
      vw.push(
        index === 0
          ? "Phân loại #1 trống mã — khi lưu sẽ dùng mã sản phẩm (hoặc mã sinh nếu SP không có mã)."
          : `Phân loại #${index + 1} trống mã — khi lưu sẽ dùng hậu tố -${String(index + 1).padStart(2, "0")} sau mã SP.`,
      );
    }
    return { errors: ve, warnings: vw };
  });

  if (!draft.name.trim()) errors.push("Thiếu tên sản phẩm.");
  if (!draft.category.trim()) errors.push("Thiếu danh mục.");
  const catHit = draft.category.trim() ? findCategoryByImportedName(categories, draft.category) : null;
  if (catHit && !catHit.active) {
    errors.push(`Danh mục "${catHit.name}" đã tồn tại nhưng đang ngưng hoạt động.`);
  }
  if (draft.code && existingCodes.has(draft.code.trim().toUpperCase())) errors.push(`Mã SP ${draft.code} đã tồn tại.`);
  if (draft.code && duplicateCodes.has(draft.code.trim().toUpperCase())) errors.push(`Mã SP ${draft.code} bị trùng trong file.`);
  if (!draft.code.trim()) warnings.push("Mã SP để trống — hệ thống tự sinh.");
  if (draft.variants.length === 0) errors.push("Phải có ít nhất 1 phân loại.");
  if (draft.originalMessage) warnings.push(`Parser: ${draft.originalMessage}`);
  return { errors, warnings, variants };
}

function statusOf(issue: DraftIssue): "error" | "warning" | "ok" {
  const ve = issue.variants.reduce((s, v) => s + v.errors.length, 0);
  const vw = issue.variants.reduce((s, v) => s + v.warnings.length, 0);
  if (issue.errors.length + ve > 0) return "error";
  if (issue.warnings.length + vw > 0) return "warning";
  return "ok";
}

export function ProductImportReview({ filename, rows, onCancel, onSaved }: Props) {
  const navigate = useNavigate();
  const { data: productData } = useService(() => productService.list({ page: 1, pageSize: 500 }), []);
  const { data: categoryData } = useService(() => categoryService.list({ includeInactive: true }), []);
  const products = productData?.items ?? [];
  const categories = categoryData?.items ?? [];
  const [drafts, setDrafts] = useState<DraftProduct[]>(() => createDrafts(rows));
  const [validationTick, setValidationTick] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isSaving, setIsSaving] = useState(false);

  const activeDrafts = useMemo(() => drafts.filter((d) => !d.removed), [drafts]);
  const existingCodes = useMemo(() => new Set(products.map((p) => p.code.toUpperCase())), [products]);
  const duplicateCodes = useMemo(() => {
    const counts = new Map<string, number>();
    activeDrafts.forEach((d) => {
      const c = d.code.trim().toUpperCase();
      if (!c) return;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([c]) => c));
  }, [activeDrafts, validationTick]);

  const issues = useMemo(() => {
    const map = new Map<string, DraftIssue>();
    activeDrafts.forEach((d) => map.set(d.key, validateDraft(d, existingCodes, duplicateCodes, categories)));
    return map;
  }, [activeDrafts, categories, duplicateCodes, existingCodes, validationTick]);

  // Bind Excel category text to canonical catalog names (spacing/case) once categories load.
  useEffect(() => {
    if (!categories.length) return;
    setDrafts((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        const hit = findCategoryByImportedName(categories, d.category);
        if (!hit || hit.name === d.category) return d;
        changed = true;
        return { ...d, category: hit.name };
      });
      return changed ? next : prev;
    });
  }, [categories]);

  const stats = useMemo(() => {
    let err = 0, warn = 0, ok = 0, edited = 0;
    activeDrafts.forEach((d) => {
      const s = statusOf(issues.get(d.key) ?? { errors: [], warnings: [], variants: [] });
      if (s === "error") err += 1;
      else if (s === "warning") warn += 1;
      else ok += 1;
      if (d.edited) edited += 1;
    });
    return { total: activeDrafts.length, err, warn, ok, edited };
  }, [activeDrafts, issues]);

  // auto-expand error groups, collapse others
  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = { ...prev };
      activeDrafts.forEach((d) => {
        if (next[d.key] !== undefined) return;
        const s = statusOf(issues.get(d.key) ?? { errors: [], warnings: [], variants: [] });
        next[d.key] = s === "error";
      });
      return next;
    });
  }, [activeDrafts, issues]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeDrafts.filter((d) => {
      const s = statusOf(issues.get(d.key) ?? { errors: [], warnings: [], variants: [] });
      if (filter === "error" && s !== "error") return false;
      if (filter === "warning" && s !== "warning") return false;
      if (filter === "ok" && s !== "ok") return false;
      if (filter === "edited" && !d.edited) return false;
      if (!needle) return true;
      const hay = [d.code, d.name, d.category, ...d.variants.map((v) => `${v.code} ${v.name}`)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [activeDrafts, issues, filter, search]);

  const updateDraft = (key: string, patch: Partial<DraftProduct>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch, edited: true } : d)));
  };
  const updateVariant = (key: string, index: number, patch: Partial<DraftVariant>) => {
    setDrafts((prev) => prev.map((d) => (
      d.key === key
        ? { ...d, edited: true, variants: d.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) }
        : d
    )));
  };
  const addVariant = (key: string) => {
    setDrafts((prev) => prev.map((d) => (
      d.key === key
        ? {
            ...d, edited: true,
            variants: [...d.variants, {
              code: d.code ? `${d.code}-${String(d.variants.length + 1).padStart(2, "0")}` : "",
              name: "", sellPrice: 0, costPrice: 0, stock: 0,
              sellUnit: d.variants[0]?.sellUnit || "Cái",
              importUnit: d.variants[0]?.importUnit || d.variants[0]?.sellUnit || "Cái",
              piecesPerImportUnit: d.variants[0]?.piecesPerImportUnit || 1,
              expiryDays: d.variants[0]?.expiryDays || 0,
              minStock: d.variants[0]?.minStock || 5,
              active: true, note: "",
              isSellable: true, isSellableInvalid: false,
            }],
          }
        : d
    )));
  };
  const removeVariant = (key: string, index: number) => {
    setDrafts((prev) => prev.map((d) => (
      d.key === key && d.variants.length > 1
        ? { ...d, edited: true, variants: d.variants.filter((_, i) => i !== index) }
        : d
    )));
  };

  const handleRevalidate = () => {
    setValidationTick((v) => v + 1);
    toast.info(`Đã revalidate ${activeDrafts.length} sản phẩm.`);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    activeDrafts.forEach((d) => { next[d.key] = false; });
    setExpanded(next);
  };
  const expandErrors = () => {
    const next: Record<string, boolean> = { ...expanded };
    activeDrafts.forEach((d) => {
      const s = statusOf(issues.get(d.key) ?? { errors: [], warnings: [], variants: [] });
      next[d.key] = s === "error";
    });
    setExpanded(next);
  };

  const jumpToFirst = (target: "error" | "warning") => {
    const found = activeDrafts.find((d) => statusOf(issues.get(d.key) ?? { errors: [], warnings: [], variants: [] }) === target);
    if (!found) return;
    setFilter(target);
    setExpanded((prev) => ({ ...prev, [found.key]: true }));
    setTimeout(() => groupRefs.current[found.key]?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSaveAll = async () => {
    if (isSaving) return;
    if (stats.err > 0) { toast.error(`Còn ${stats.err} sản phẩm có lỗi.`); return; }
    if (stats.total === 0) { toast.error("Không còn sản phẩm nào để lưu."); return; }

    toast.loading("Đang lưu import...", { id: PRODUCT_IMPORT_SAVE_TOAST_ID });
    setIsSaving(true);

    const usedCodes = new Set<string>([...existingCodes]);
    let createdProducts = 0, createdVariants = 0, createdCategories = 0;
    let catCache: Category[] = [...categories];

    const refreshCategoryCache = async () => {
      const refreshed = await categoryService.list({ includeInactive: true });
      catCache = refreshed.items;
    };

    try {
      for (const draft of activeDrafts) {
        let category = findCategoryByImportedName(catCache, draft.category);
        if (!category) {
          try {
            const created = await categoryService.create({
              name: draft.category.trim(),
              description: "Tạo từ import Excel",
            });
            catCache.push(created);
            category = created;
            createdCategories += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await refreshCategoryCache();
            category = findCategoryByImportedName(catCache, draft.category);
            if (!category) {
              toast.error(`Không thể tạo hoặc tìm danh mục "${draft.category.trim()}". ${msg}`, { id: PRODUCT_IMPORT_SAVE_TOAST_ID });
              return;
            }
          }
        }
        if (!category.active) {
          toast.error(`Danh mục "${category.name}" đang ngưng hoạt động — không thể import (dòng ${draft.sourceRow}).`, { id: PRODUCT_IMPORT_SAVE_TOAST_ID });
          return;
        }
        const productCode = draft.code.trim()
          ? draft.code.trim().toUpperCase()
          : generateProductCode(draft.name, draft.category, usedCodes);
        const upper = productCode.toUpperCase();
        if (usedCodes.has(upper)) {
          toast.error(`Mã sản phẩm "${productCode}" trùng trong phiên lưu — có thể vừa được tạo hoặc trùng dòng khác (Excel #${draft.sourceRow}).`, { id: PRODUCT_IMPORT_SAVE_TOAST_ID });
          return;
        }
        usedCodes.add(upper);

        const variantsPayload = buildVariantsForProductImportCreate(productCode, draft.name, draft.variants);

        await productService.create({
          code: productCode,
          name: draft.name.trim(),
          categoryId: category.id,
          categoryName: category.name,
          image: "",
          active: draft.variants.some((v) => v.active),
          type: draft.variants.length > 1 ? "multi" : "single",
          variants: variantsPayload,
        });
        createdProducts += 1;
        createdVariants += draft.variants.length;
      }

      toast.success(`Đã tạo ${createdProducts} sản phẩm · ${createdVariants} phân loại${createdCategories ? ` · ${createdCategories} danh mục mới` : ""}.`, { id: PRODUCT_IMPORT_SAVE_TOAST_ID });
      onSaved();
      navigate("/admin/products", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Đã tạo ${createdProducts}/${stats.total} sản phẩm trước khi lỗi. ${msg}`, { id: PRODUCT_IMPORT_SAVE_TOAST_ID });
    } finally {
      setIsSaving(false);
    }
  };

  const Chip = ({ active, tone, label, count, onClick }: { active: boolean; tone: "all" | "error" | "warning" | "ok" | "edited"; label: string; count: number; onClick: () => void }) => (
    <button onClick={onClick} className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      active && tone === "all" && "bg-primary text-primary-foreground border-primary",
      active && tone === "error" && "bg-danger text-danger-foreground border-danger",
      active && tone === "warning" && "bg-warning text-warning-foreground border-warning",
      active && tone === "ok" && "bg-success text-success-foreground border-success",
      active && tone === "edited" && "bg-info text-info-foreground border-info",
      !active && "bg-card hover:bg-muted",
    )}>
      {label} <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{count}</span>
    </button>
  );

  return (
    <div className="space-y-3 admin-dense pb-24 lg:pb-4">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/admin/products" className="hover:text-foreground">Sản phẩm</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Tạo sản phẩm</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Import từ Excel</span>
      </nav>

      <PageHeader
        title="Review import sản phẩm"
        description="Sửa lỗi từng sản phẩm/phân loại, revalidate rồi lưu hàng loạt."
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={collapseAll} disabled={isSaving} className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Thu gọn tất cả</button>
            <button onClick={expandErrors} disabled={isSaving} className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Mở nhóm lỗi</button>
            <button onClick={handleRevalidate} disabled={isSaving} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" /> Revalidate
            </button>
            <button onClick={onCancel} disabled={isSaving} className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">Hủy import</button>
            <button
              onClick={handleSaveAll}
              disabled={stats.err > 0 || stats.total === 0 || isSaving}
              title={stats.err > 0 ? `Còn ${stats.err} sản phẩm lỗi` : ""}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu… ({stats.total})
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> Lưu import ({stats.total})
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-info-soft px-2 py-1 text-[11px] font-medium text-info">
          <FileSpreadsheet className="h-3.5 w-3.5" /> {filename}
        </span>
        <span className="text-xs text-muted-foreground">{stats.total} sản phẩm</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Chip active={filter === "all"} tone="all" label="Tất cả" count={stats.total} onClick={() => setFilter("all")} />
          <button onClick={() => jumpToFirst("error")} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", filter === "error" ? "bg-danger text-danger-foreground border-danger" : "bg-danger-soft text-danger hover:bg-danger/10")}>
            <AlertCircle className="h-3 w-3" /> Lỗi <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.err}</span>
          </button>
          <button onClick={() => jumpToFirst("warning")} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", filter === "warning" ? "bg-warning text-warning-foreground border-warning" : "bg-warning-soft text-warning hover:bg-warning/10")}>
            <AlertTriangle className="h-3 w-3" /> Cảnh báo <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.warn}</span>
          </button>
          <Chip active={filter === "ok"} tone="ok" label="Hợp lệ" count={stats.ok} onClick={() => setFilter("ok")} />
          <Chip active={filter === "edited"} tone="edited" label="Đã sửa" count={stats.edited} onClick={() => setFilter("edited")} />
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo mã SP, mã variant, tên, danh mục..."
          className="h-8 w-full rounded-md border bg-card pl-8 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {stats.err > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft p-2.5 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Còn lỗi blocking — nút lưu bị khóa cho tới khi sửa xong. Bấm <strong>Lỗi</strong> phía trên để nhảy tới nhóm đầu tiên.</span>
        </div>
      )}

      {/* Product groups */}
      <div className="space-y-2">
        {filtered.map((draft) => {
          const issue = issues.get(draft.key) ?? { errors: [], warnings: [], variants: [] };
          const status = statusOf(issue);
          const isOpen = expanded[draft.key] ?? (status === "error");
          const variantErr = issue.variants.reduce((s, v) => s + v.errors.length, 0);
          const variantWarn = issue.variants.reduce((s, v) => s + v.warnings.length, 0);
          const issueCount = issue.errors.length + issue.warnings.length + variantErr + variantWarn;
          const catHit = draft.category.trim() ? findCategoryByImportedName(categories, draft.category) : null;

          return (
            <div
              key={draft.key}
              ref={(el) => (groupRefs.current[draft.key] = el)}
              className={cn(
                "overflow-hidden rounded-lg border bg-card",
                status === "error" && "border-danger/40 ring-1 ring-danger/20",
                status === "warning" && "border-warning/40",
              )}
            >
              {/* Header */}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setExpanded((p) => ({ ...p, [draft.key]: !isOpen }))}
                className="flex w-full items-center gap-3 border-b bg-muted/30 px-3 py-2 text-left hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-60"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">#{draft.sourceRow}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{draft.code || "(tự sinh)"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{draft.name || <em className="text-danger">Thiếu tên</em>}</span>
                <span className="hidden sm:inline text-[11px] text-muted-foreground">{draft.category || <em className="text-danger">Thiếu DM</em>}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">{draft.variants.length} VAR</span>
                {status === "error" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[10px] font-medium text-danger">
                    <AlertCircle className="h-3 w-3" /> {issueCount} lỗi
                  </span>
                )}
                {status === "warning" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">
                    <AlertTriangle className="h-3 w-3" /> {issueCount}
                  </span>
                )}
                {status === "ok" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
                    <CheckCircle2 className="h-3 w-3" /> OK
                  </span>
                )}
                {draft.edited && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info">Đã sửa</span>}
                <span
                  role="button"
                  onClick={(e) => {
                    if (isSaving) return;
                    e.stopPropagation();
                    updateDraft(draft.key, { removed: true });
                  }}
                  className={cn(
                    "rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger",
                    isSaving && "pointer-events-none opacity-50",
                  )}
                  title="Bỏ khỏi import"
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </button>

              {/* Body — lazy render */}
              {isOpen && (
                <div className="space-y-2 p-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <div>
                      <label className="text-[10px] font-medium uppercase text-muted-foreground">Mã SP</label>
                      <input
                        value={draft.code}
                        onChange={(e) => updateDraft(draft.key, { code: e.target.value.toUpperCase() })}
                        placeholder="Để trống = tự sinh"
                        className="mt-0.5 h-7 w-full rounded-md border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium uppercase text-muted-foreground">Tên SP *</label>
                      <input
                        value={draft.name}
                        onChange={(e) => updateDraft(draft.key, { name: e.target.value })}
                        className={cn("mt-0.5 h-7 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring", !draft.name.trim() && "border-danger")}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium uppercase text-muted-foreground">Danh mục *</label>
                      <select
                        value={draft.category}
                        onChange={(e) => updateDraft(draft.key, { category: e.target.value })}
                        className={cn(
                          "mt-0.5 h-7 w-full rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
                          (!draft.category.trim() || (catHit && !catHit.active)) && "border-danger",
                        )}
                      >
                        <option value="">Chọn danh mục</option>
                        {categories.filter((c) => c.active).map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                        {catHit && !catHit.active && (
                          <option key={`inactive-${catHit.id}`} value={catHit.name} disabled>
                            {catHit.name} (đã ngưng hoạt động)
                          </option>
                        )}
                        {draft.category.trim() && isImportedCategoryNew(categories, draft.category) && (
                          <option value={draft.category.trim()}>{draft.category.trim()} (mới)</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {(issue.errors.length > 0 || issue.warnings.length > 0) && (
                    <div className="space-y-0.5 rounded-md bg-muted/30 px-2 py-1.5 text-[11px]">
                      {issue.errors.map((m, i) => <div key={`e-${i}`} className="flex items-center gap-1 text-danger"><AlertCircle className="h-3 w-3" /> {m}</div>)}
                      {issue.warnings.map((m, i) => <div key={`w-${i}`} className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> {m}</div>)}
                    </div>
                  )}

                  {/* Variants table */}
                  <div className="overflow-x-auto rounded-md border">
                    <table className="min-w-[1100px] w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/20 text-[10px] uppercase text-muted-foreground">
                          <th className="px-2 py-1.5 text-left font-medium">Mã variant</th>
                          <th className="px-2 py-1.5 text-left font-medium">Tên</th>
                          <th className="px-2 py-1.5 text-left font-medium w-28">Bán lẻ</th>
                          <th className="px-2 py-1.5 text-center font-medium">ĐV nhập / bán</th>
                          <th className="px-2 py-1.5 text-center font-medium">Quy đổi</th>
                          <th className="px-2 py-1.5 text-right font-medium">Giá vốn</th>
                          <th className="px-2 py-1.5 text-right font-medium">Giá bán</th>
                          <th className="px-2 py-1.5 text-center font-medium">Tồn đầu</th>
                          <th className="px-2 py-1.5 text-center font-medium">HSD/Min</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {draft.variants.map((variant, index) => {
                          const vi = issue.variants[index] ?? { errors: [], warnings: [] };
                          return (
                            <>
                              <tr key={`${draft.key}-${index}`} className="border-b last:border-0 align-top">
                                <td className="px-2 py-1.5"><input value={variant.code} onChange={(e) => updateVariant(draft.key, index, { code: e.target.value.toUpperCase() })} className="h-7 w-full rounded border bg-background px-2 font-mono text-[11px]" placeholder="Tự sinh" /></td>
                                <td className="px-2 py-1.5"><input value={variant.name} onChange={(e) => updateVariant(draft.key, index, { name: e.target.value })} className={cn("h-7 w-full rounded border bg-background px-2 text-[11px]", !variant.name.trim() && "border-danger")} /></td>
                                <td className="px-2 py-1.5 text-[10px] text-muted-foreground whitespace-nowrap">
                                  {productImportRowSellableLabel({ isSellable: variant.isSellable, isSellableInvalid: variant.isSellableInvalid })}
                                </td>
                                <td className="px-2 py-1.5">
                                  <div className="grid grid-cols-2 gap-1">
                                    <input value={variant.importUnit} onChange={(e) => updateVariant(draft.key, index, { importUnit: e.target.value })} className="h-7 rounded border bg-background px-2 text-[11px]" placeholder="Nhập" />
                                    <input value={variant.sellUnit} onChange={(e) => updateVariant(draft.key, index, { sellUnit: e.target.value })} className={cn("h-7 rounded border bg-background px-2 text-[11px]", !variant.sellUnit.trim() && "border-danger")} placeholder="Bán" />
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-center"><input type="number" value={variant.piecesPerImportUnit} onChange={(e) => updateVariant(draft.key, index, { piecesPerImportUnit: Number(e.target.value) })} className={cn("h-7 w-16 rounded border bg-background px-2 text-center text-[11px]", variant.piecesPerImportUnit <= 0 && "border-danger")} /></td>
                                <td className="px-2 py-1.5 text-right">
                                  <div className="relative">
                                    <input type="number" min={0} step={1000} value={variant.costPrice} onChange={(e) => updateVariant(draft.key, index, { costPrice: Math.max(0, Number(e.target.value)) })} className={cn("h-7 w-28 rounded border bg-background pl-2 pr-8 text-right text-[11px]", variant.costPrice <= 0 && "border-danger")} />
                                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-muted-foreground">₫</span>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <div className="relative">
                                    <input type="number" min={0} step={1000} value={variant.sellPrice} onChange={(e) => updateVariant(draft.key, index, { sellPrice: Math.max(0, Number(e.target.value)) })} className={cn("h-7 w-28 rounded border bg-background pl-2 pr-8 text-right text-[11px]", variant.sellPrice <= 0 && "border-danger")} />
                                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-medium text-muted-foreground">₫</span>
                                  </div>
                                </td>
                                <td className="px-2 py-1.5 text-center"><input type="number" value={variant.stock} onChange={(e) => updateVariant(draft.key, index, { stock: Number(e.target.value) })} className={cn("h-7 w-16 rounded border bg-background px-2 text-center text-[11px]", variant.stock < 0 && "border-danger")} /></td>
                                <td className="px-2 py-1.5">
                                  <div className="grid grid-cols-2 gap-1">
                                    <input type="number" value={variant.expiryDays} onChange={(e) => updateVariant(draft.key, index, { expiryDays: Number(e.target.value) })} className="h-7 rounded border bg-background px-2 text-center text-[11px]" placeholder="HSD" />
                                    <input type="number" value={variant.minStock} onChange={(e) => updateVariant(draft.key, index, { minStock: Number(e.target.value) })} className={cn("h-7 rounded border bg-background px-2 text-center text-[11px]", variant.minStock < 0 && "border-danger")} placeholder="Min" />
                                  </div>
                                </td>
                                <td className="px-1 py-1.5 text-center">
                                  {draft.variants.length > 1 && (
                                    <button type="button" disabled={isSaving} onClick={() => removeVariant(draft.key, index)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-50"><Trash2 className="h-3 w-3" /></button>
                                  )}
                                </td>
                              </tr>
                              {(vi.errors.length > 0 || vi.warnings.length > 0) && (
                                <tr key={`${draft.key}-${index}-iss`} className="border-b last:border-0 bg-muted/10">
                                  <td colSpan={10} className="px-2 py-1 text-[10px]">
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                      {vi.errors.map((m, i) => <span key={`ve-${i}`} className="inline-flex items-center gap-1 text-danger"><AlertCircle className="h-3 w-3" /> {m}</span>)}
                                      {vi.warnings.map((m, i) => <span key={`vw-${i}`} className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> {m}</span>)}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{draft.variants.length} phân loại</span>
                    <button onClick={() => addVariant(draft.key)} disabled={isSaving} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50">
                      <Plus className="h-3 w-3" /> Thêm phân loại
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {activeDrafts.length === 0 ? "Không còn sản phẩm nào trong import." : "Không có sản phẩm khớp bộ lọc."}
        </div>
      )}

      {/* Sticky footer (mobile + desktop) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 border-t bg-card/95 px-3 py-2 backdrop-blur lg:left-64">
        <div className="hidden text-xs text-muted-foreground sm:block">
          <strong>{stats.total}</strong> SP · <span className="text-success">{stats.ok} OK</span> · <span className="text-warning">{stats.warn} cảnh báo</span> · <span className="text-danger">{stats.err} lỗi</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={handleRevalidate} disabled={isSaving} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> Revalidate
          </button>
          <button onClick={handleSaveAll} disabled={stats.err > 0 || stats.total === 0 || isSaving} title={stats.err > 0 ? `Còn ${stats.err} lỗi blocking` : ""} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu…
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> Lưu import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
