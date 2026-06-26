import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp,
  FileSpreadsheet, FileText, Filter, Loader2, Package, Pencil, Printer, RefreshCw, Save, Search,
  Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { DateInput } from "@/components/shared/DateInput";
import { BarcodePrintDialog } from "@/components/shared/BarcodePrintDialog";
import { SearchableCombobox } from "@/components/shared/SearchableCombobox";
import { VariantSearchPicker } from "@/components/shared/VariantSearchPicker";
import { SupplierFormDrawer } from "@/components/shared/SupplierFormDrawer";
import { ReceiptImportPreviewDialog } from "@/components/shared/ReceiptImportPreviewDialog";
import { importStaging } from "@/lib/import-staging";
import { draftActions } from "@/lib/drafts";
import { formatVND } from "@/lib/format";
import { receiptImportRowSellableLabel, type ImportSeverity, type ReceiptImportOutcome, type ReceiptImportRow } from "@/lib/import-types";
import type { Product, ProductVariant } from "@/lib/catalog-types";
import { cn } from "@/lib/utils";
import { addLocalCalendarDays, localToday, parseLocalDateInput } from "@/lib/localDate";
import { getAdminSession } from "@/services/auth/adminApi";
import { adminSuppliers, categories as categoryService, products as productService } from "@/services";
import type { VariantTransactionSearchHit } from "@/services/catalog/variantTransactionSearch";
import { useService } from "@/hooks/useService";
import {
  createInventoryReceipt,
  type InventoryReceiptCreateItem,
  type InventoryReceiptItemResponse,
} from "@/services/inventory/inventoryReceiptApi";
import { fetchBatchesByReceiptId, type ProductBatchResponse } from "@/services/batches/batchReceiptApi";
import type { BarcodeItem } from "@/components/shared/BarcodePrintDialog";

interface ReceiptLineDraft {
  id: string;
  sourceRow: number;
  status: ImportSeverity;
  outcome: ReceiptImportOutcome;
  message?: string;
  productCode: string;
  variantCode: string;
  productId?: number;
  variantId?: number;
  productName: string;
  variantName: string;
  category: string;
  newProductUnit: string;
  importUnit: string;
  sellUnit: string;
  piecesPerUnit: number;
  quantity: number;
  unitCost: number;
  sellPrice: number;
  discountPercent: number;
  expiryDate: string;
  expiryDays: number;
  expiryMode: "date" | "days";
  note: string;
  fromImport: boolean;
  edited?: boolean;
  isSellable?: boolean;
  isSellableExplicit?: boolean;
  isSellableInvalid?: boolean;
  importParserWarnings?: string[];
}

let validationCatalog: Product[] = [];

interface LineIssue { errors: string[]; warnings: string[]; }
type StatusFilter = "all" | "error" | "warning" | "ok" | "edited";

const initialLines: ReceiptLineDraft[] = [];

export function resolveReceiptLineIdentity(
    line: Pick<ReceiptLineDraft, "productId" | "variantId">,
    fallback: () => { productId: number; variantId: number } | null,
): { productId: number; variantId: number } | null {
  const productId = Number(line.productId);
  const variantId = Number(line.variantId);
  if (Number.isFinite(productId) && Number.isFinite(variantId)) {
    return { productId, variantId };
  }
  return fallback();
}

/** Compose a human-readable label for a receipt line (used in toasts/logs). */
export function buildReceiptLineLabel(
    line: Partial<Pick<ReceiptLineDraft, "productCode" | "variantCode" | "productName">>,
    index: number,
): string {
  const parts = [line.productCode, line.variantCode]
      .map((s) => (s ?? "").trim())
      .filter((s) => s.length > 0);
  const base = parts.length ? parts.join(" / ") : (line.productName?.trim() || `#${index + 1}`);
  return `${base} (#${index + 1})`;
}

/** Build the toast message for "cannot resolve identity" — productId/variantId luôn nằm trong message chính. */
export function buildReceiptIdentityMissingToast(
    line: Partial<Pick<ReceiptLineDraft, "productCode" | "variantCode" | "productName" | "outcome">>,
    index: number,
    fallbackIdentity?: { productId: number; variantId: number } | null,
): string {
  const pid = fallbackIdentity && Number.isFinite(fallbackIdentity.productId)
      ? String(fallbackIdentity.productId)
      : "?";
  const vid = fallbackIdentity && Number.isFinite(fallbackIdentity.variantId)
      ? String(fallbackIdentity.variantId)
      : "?";
  const label = buildReceiptLineLabel(line, index);
  const outcome = line.outcome;
  let hint: string;
  if (outcome === "create-product-and-variant") {
    hint = "Đây là SP MỚI chưa có trong catalog backend. Hãy tạo sản phẩm trước (Quản trị → Sản phẩm) rồi import lại, hoặc xoá dòng.";
  } else if (outcome === "create-variant") {
    hint = "Đây là VARIANT MỚI cho SP đã có. Hãy tạo variant trong trang Sản phẩm rồi import lại, hoặc xoá dòng.";
  } else {
    hint = "Vui lòng chọn lại biến thể từ ô \"Thêm dòng từ kho\" để gán productId/variantId backend.";
  }
  return `Không xác định được sản phẩm/biến thể cho dòng ${label} — productId=${pid}, variantId=${vid}. ${hint}`;
}

/** Build the toast message for "identity is not a finite number". */
export function buildReceiptIdentityInvalidToast(
    line: Partial<Pick<ReceiptLineDraft, "productCode" | "variantCode" | "productName">>,
    index: number,
    identity: { productId: unknown; variantId: unknown },
): string {
  return `ID sản phẩm/variant không hợp lệ cho dòng ${buildReceiptLineLabel(line, index)} — productId=${String(identity.productId)}, variantId=${String(identity.variantId)}. Cần catalog backend (id số).`;
}

function createLineId(prefix = "line") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function convertImportedRow(row: ReceiptImportRow, _receiptDate: string, index: number): ReceiptLineDraft {
  const hasDate = !!row.expiryDate;
  const hasDays = !!(row.expiryDays && row.expiryDays > 0);
  const expiryMode: "date" | "days" = hasDate ? "date" : hasDays ? "days" : "date";
  return {
    id: createLineId(`imp-${index}`),
    sourceRow: row.sourceRow,
    status: row.status,
    outcome: row.outcome,
    message: row.message,
    productCode: row.productCode,
    variantCode: row.variantCode,
    productName: row.productName,
    variantName: row.variantName,
    category: row.category || "",
    newProductUnit: row.newProductUnit || "",
    importUnit: row.importUnit,
    sellUnit: row.sellUnit,
    piecesPerUnit: row.piecesPerUnit,
    quantity: row.quantity,
    unitCost: row.unitCost,
    sellPrice: row.sellPrice,
    discountPercent: Number.isFinite(Number(row.discountPercent)) ? Number(row.discountPercent) : 0,
    expiryDate: hasDate ? row.expiryDate : "",
    expiryDays: hasDays ? row.expiryDays! : 0,
    expiryMode,
    note: row.note || "",
    fromImport: true,
    isSellable: row.isSellable,
    isSellableExplicit: row.isSellableExplicit,
    isSellableInvalid: row.isSellableInvalid,
    importParserWarnings: row.importWarnings,
  };
}

function inferOutcome(line: ReceiptLineDraft): { outcome: ReceiptImportOutcome; message?: string } {
  if (Number.isFinite(Number(line.productId)) && Number.isFinite(Number(line.variantId))) {
    return { outcome: "update-pricing", message: "Dùng sản phẩm/variant đã chọn từ backend." };
  }
  const product = validationCatalog.find((p) => p.code.toUpperCase() === line.productCode.trim().toUpperCase());
  if (!product) return { outcome: "create-product-and-variant", message: `Tạo SP mới ${line.productCode || "(?)"}.` };
  if (!line.variantCode.trim()) {
    const v = product.variants.find((x) => x.isDefault) ?? product.variants[0];
    return { outcome: v?.importUnit ? "use-default-variant" : "update-legacy-unit", message: `Dùng variant mặc định ${v?.name ?? ""}.` };
  }
  const variant = product.variants.find((x) => x.code.toUpperCase() === line.variantCode.trim().toUpperCase());
  if (!variant) return { outcome: "create-variant", message: `Tạo variant mới ${line.variantCode}.` };
  return {
    outcome: variant.importUnit ? "update-pricing" : "update-legacy-unit",
    message: variant.importUnit ? "Cập nhật giá/tồn." : "Bổ sung đơn vị.",
  };
}

function findCatalogMatch(line: ReceiptLineDraft): { product: Product; variant?: ProductVariant } | null {
  const pc = line.productCode.trim().toUpperCase();
  const vc = line.variantCode.trim().toUpperCase();
  if (vc) {
    for (const p of validationCatalog) {
      const variant = p.variants.find((x) => x.code.toUpperCase() === vc);
      if (variant) return { product: p, variant };
    }
  }
  if (pc) {
    const product = validationCatalog.find((p) => p.code.toUpperCase() === pc);
    if (product) {
      const def = product.variants.find((x) => x.isDefault) ?? product.variants[0];
      return { product, variant: def };
    }
  }
  return null;
}

function hydrateLineFromCatalog(
    line: ReceiptLineDraft,
    categoryNameById: Map<string, string>,
): ReceiptLineDraft {
  const match = findCatalogMatch(line);
  if (!match) return line;
  const { product, variant } = match;
  const next: ReceiptLineDraft = { ...line };
  const isBlankOrEqual = (val: string, ref: string) => {
    const v = (val ?? "").trim();
    const r = (ref ?? "").trim();
    return !v || (!!r && v.toUpperCase() === r.toUpperCase());
  };

  if (!next.productCode.trim() && product.code) next.productCode = product.code;
  if (product.name && isBlankOrEqual(next.productName, next.productCode)) {
    next.productName = product.name;
  }
  if (!Number.isFinite(Number(next.productId)) && Number.isFinite(Number(product.id))) {
    next.productId = Number(product.id);
  }
  if (variant) {
    if (!next.variantCode.trim() && variant.code) next.variantCode = variant.code;
    if (variant.name && isBlankOrEqual(next.variantName, next.variantCode)) {
      next.variantName = variant.name;
    }
    if (!Number.isFinite(Number(next.variantId)) && Number.isFinite(Number(variant.id))) {
      next.variantId = Number(variant.id);
    }
  }
  if (!next.category.trim()) {
    if (product.categoryName?.trim()) {
      next.category = product.categoryName;
    } else if (product.categoryId) {
      const fromMap = categoryNameById.get(String(product.categoryId));
      if (fromMap) next.category = fromMap;
    }
  }
  return next;
}

function validateImportedLine(line: ReceiptLineDraft): LineIssue {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!line.productCode.trim()) errors.push("Thiếu mã SP.");
  if (!line.productName.trim()) warnings.push("Thiếu tên SP hiển thị.");
  if (line.quantity <= 0) errors.push("Số lượng phải > 0.");
  const retailQty = line.quantity * line.piecesPerUnit;
  if (line.quantity > 0 && line.piecesPerUnit > 0 && !Number.isInteger(Number(retailQty.toFixed(8)))) {
    errors.push("Số lượng × quy đổi phải ra số nguyên đơn vị bán lẻ.");
  }
  if (line.unitCost <= 0) errors.push("Giá nhập phải > 0.");
  if (!line.importUnit.trim()) errors.push("Thiếu ĐV nhập.");
  if (!line.sellUnit.trim()) errors.push("Thiếu ĐV bán.");
  if (line.piecesPerUnit <= 0) errors.push("Quy đổi phải > 0.");
  if (line.discountPercent < 0 || line.discountPercent > 100) errors.push("CK 0-100%.");
  if (line.expiryMode === "date" && !line.expiryDate) warnings.push("Chưa có HSD.");
  if (line.expiryMode === "days" && line.expiryDays <= 0) errors.push("Số ngày HSD phải > 0.");

  const product = validationCatalog.find((p) => p.code.toUpperCase() === line.productCode.trim().toUpperCase());
  const hasBackendIdentity =
      Number.isFinite(Number(line.productId)) && Number.isFinite(Number(line.variantId));
  if (!product && !hasBackendIdentity) {
    if (!line.category.trim()) errors.push("SP mới phải có danh mục.");
    if (!line.productName.trim()) errors.push("SP mới phải có tên.");
  } else if (product && line.variantCode.trim()) {
    const v = product.variants.find((x) => x.code.toUpperCase() === line.variantCode.trim().toUpperCase());
    if (v && v.importUnit && v.importUnit.trim().toUpperCase() !== line.importUnit.trim().toUpperCase()) {
      errors.push(`Variant đang dùng ${v.importUnit}/${v.piecesPerImportUnit}, Excel: ${line.importUnit}/${line.piecesPerUnit}.`);
    }
  }
  if (line.sellPrice > 0 && line.unitCost > 0 && line.sellPrice < line.unitCost) warnings.push("Giá bán < giá nhập.");
  const inferred = inferOutcome(line);
  const needsPositiveSellForNewVariant =
      inferred.outcome === "create-product-and-variant" || inferred.outcome === "create-variant";
  if (needsPositiveSellForNewVariant && line.isSellable !== false) {
    if (!Number.isFinite(line.sellPrice) || line.sellPrice <= 0) {
      errors.push("SP/variant mới và đang bán — giá bán phải > 0.");
    }
  }
  const known = validationCatalog.flatMap((p) => p.variants).find((v) => v.code === line.variantCode);
  if (known && line.unitCost > known.costPrice * 2) warnings.push(`Giá nhập cao bất thường (gần nhất ${formatVND(known.costPrice)}).`);
  if (line.isSellableInvalid) errors.push("Cột bán hàng (P) không hợp lệ.");
  if (!line.variantCode.trim()) warnings.push("Variant trống — sẽ dùng default.");
  if (line.fromImport && line.importParserWarnings?.length && !line.variantCode.trim()) {
    line.importParserWarnings.forEach((w) => { if (w) warnings.push(w); });
  }
  return { errors, warnings };
}

function revalidateLines(lines: ReceiptLineDraft[]): ReceiptLineDraft[] {
  return lines.map((line) => {
    const issue = validateImportedLine(line);
    const inferred = inferOutcome(line);
    const status: ImportSeverity = issue.errors.length ? "error" : issue.warnings.length ? "warning" : "ready";
    return { ...line, status, outcome: inferred.outcome, message: issue.errors[0] ?? issue.warnings[0] ?? inferred.message };
  });
}

// UI-only display helpers
function shortIssueLabel(message: string): string {
  const raw = message || "";
  const m = raw.toLowerCase();
  if (m.includes("số ngày hsd")) return "Số ngày HSD";
  if (m.includes("hsd")) return "Thiếu HSD";
  if (m.includes("ncc")) return "Thiếu NCC";
  if (m.includes("variant đang dùng")) return "Lệch ĐV";
  if (m.includes("quy đổi")) return "Quy đổi";
  if (m.includes("đv nhập")) return "Thiếu ĐV nhập";
  if (m.includes("đv bán")) return "Thiếu ĐV bán";
  if (m.includes("cao bất thường") || m.includes("bất thường")) return "Giá bất thường";
  if (m.includes("giá bán < giá nhập")) return "Bán < Nhập";
  if (m.includes("danh mục")) return "Thiếu danh mục";
  if (m.includes("thiếu mã sp")) return "Thiếu mã SP";
  if (m.includes("thiếu tên")) return "Thiếu tên";
  if (m.includes("số lượng")) return "SL ≤ 0";
  if (m.includes("giá nhập phải")) return "Giá nhập ≤ 0";
  if (m.includes("giá bán phải")) return "Giá bán ≤ 0";
  if (m.startsWith("ck")) return "CK ngoài 0–100";
  if (m.includes("variant trống")) return "Default variant";
  if (m.includes("(p)")) return "Cờ bán hàng";
  return raw.length > 28 ? raw.slice(0, 26) + "…" : raw;
}

function outcomeChipLabel(outcome: ReceiptImportOutcome): string {
  switch (outcome) {
    case "update-pricing": return "Update pricing";
    case "update-legacy-unit": return "Legacy unit";
    case "create-product-and-variant": return "Tạo SP mới";
    case "create-variant": return "Tạo variant";
    case "use-default-variant": return "Default variant";
    default: return String(outcome);
  }
}

function formatLineUnitSummary(line: ReceiptLineDraft): string {
  const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
  const imp = line.importUnit?.trim() || "?";
  const sell = line.sellUnit?.trim() || "?";
  const conv = Math.max(1, line.piecesPerUnit || 1);
  return `${qty} ${imp} · 1 ${imp} = ${conv} ${sell}`;
}

function formatLineHsdSummary(line: ReceiptLineDraft): string {
  if (line.expiryMode === "date") {
    return line.expiryDate ? `HSD ${line.expiryDate}` : "Chưa có HSD";
  }
  return line.expiryDays > 0 ? `SD ${line.expiryDays} ngày` : "Chưa có số ngày SD";
}

interface LineDisplay {
  productName: string;
  productCode: string;
  variantName: string;
  variantCode: string;
  categoryName: string;
}

function getLineDisplay(line: ReceiptLineDraft, categoryNameById: Map<string, string>): LineDisplay {
  const match = findCatalogMatch(line);
  const bp = match?.product;
  const bv = match?.variant;

  const lineProductName = (line.productName ?? "").trim();
  const lineProductCode = (line.productCode ?? "").trim();
  const lineVariantName = (line.variantName ?? "").trim();
  const lineVariantCode = (line.variantCode ?? "").trim();
  const lineCategory = (line.category ?? "").trim();

  const productCode = lineProductCode || (bp?.code ?? "");
  const variantCode = lineVariantCode || (bv?.code ?? "");

  const sameAsCode = (n: string, c: string) =>
      !!n && !!c && n.trim().toUpperCase() === c.trim().toUpperCase();

  let productName = "";
  if (bp?.name && (!lineProductName || sameAsCode(lineProductName, productCode))) {
    productName = bp.name;
  } else if (lineProductName && !sameAsCode(lineProductName, productCode)) {
    productName = lineProductName;
  } else {
    productName = bp?.name || lineProductName || "";
  }

  let variantName = "";
  if (bv?.name && !sameAsCode(bv.name, variantCode)) {
    variantName = bv.name;
  } else if (lineVariantName && !sameAsCode(lineVariantName, variantCode)) {
    variantName = lineVariantName;
  }

  let categoryName = lineCategory;
  if (!categoryName && bp?.categoryName?.trim()) categoryName = bp.categoryName.trim();
  if (!categoryName && bp?.categoryId) {
    categoryName = categoryNameById.get(String(bp.categoryId)) ?? "";
  }

  return { productName, productCode, variantName, variantCode, categoryName };
}

// ============================================================================
// Module-scope presentational components — stable identity across parent renders
// to keep input focus while editing.
// ============================================================================

function CompactField({
                        label,
                        children,
                        className,
                        align = "left",
                      }: {
  label: string;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
      <div className={cn("min-w-0 flex flex-col", className)}>
        <div
            className={cn(
                "text-[9px] uppercase tracking-wide text-muted-foreground leading-none h-3 flex items-center",
                align === "right" && "justify-end",
            )}
        >
          {label}
        </div>
        <div
            className={cn(
                "mt-1 min-h-[20px] flex flex-col justify-start leading-tight",
                align === "right" && "items-end text-right",
            )}
        >
          {children}
        </div>
      </div>
  );
}

function IssueChips({ issue }: { issue: LineIssue }) {
  const items: { tone: "error" | "warning"; raw: string }[] = [
    ...issue.errors.map((m) => ({ tone: "error" as const, raw: m })),
    ...issue.warnings.map((m) => ({ tone: "warning" as const, raw: m })),
  ];
  if (!items.length) return null;
  const visible = items.slice(0, 2);
  const extra = items.length - visible.length;
  return (
      <div className="flex flex-wrap items-center gap-1">
        {visible.map((it, i) => (
            <span
                key={i}
                title={it.raw}
                className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    it.tone === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
                )}
            >
          {it.tone === "error" ? <AlertCircle className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
              {shortIssueLabel(it.raw)}
        </span>
        ))}
        {extra > 0 && (
            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          +{extra}
        </span>
        )}
      </div>
  );
}

function IssueDetails({ issue }: { issue: LineIssue }) {
  if (!issue.errors.length && !issue.warnings.length) {
    return <div className="text-[11px] text-muted-foreground">Không có cảnh báo.</div>;
  }
  return (
      <div className="space-y-1 text-[11px]">
        {issue.errors.map((m, i) => (
            <div key={`e-${i}`} className="flex items-start gap-1.5 text-danger">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{m}</span>
            </div>
        ))}
        {issue.warnings.map((m, i) => (
            <div key={`w-${i}`} className="flex items-start gap-1.5 text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{m}</span>
            </div>
        ))}
      </div>
  );
}

interface LineEditorProps {
  line: ReceiptLineDraft;
  issue: LineIssue;
  categoryOptions: { id: string; label: string; sub?: string }[];
  isSaving: boolean;
  resolvedCategoryName: string;
  computePreviewDate: (line: ReceiptLineDraft) => string;
  onPatch: (lineId: string, patch: Partial<ReceiptLineDraft>) => void;
  onCreateCategory: (lineId: string, query: string) => void;
  onCollapse: (lineId: string) => void;
}

function LineEditor({
                      line,
                      issue,
                      categoryOptions,
                      isSaving: _isSaving,
                      resolvedCategoryName,
                      computePreviewDate,
                      onPatch,
                      onCreateCategory,
                      onCollapse,
                    }: LineEditorProps) {
  return (
      <div className="space-y-3 rounded-md border border-dashed bg-muted/20 p-3">
        {/* Row 1-2: codes + names */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Mã SP *</label>
            <input
                value={line.productCode}
                onChange={(e) => onPatch(line.id, { productCode: e.target.value.toUpperCase() })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs font-mono", !line.productCode.trim() && "border-danger")}
                placeholder="Mã SP"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Mã variant</label>
            <input
                value={line.variantCode}
                onChange={(e) => onPatch(line.id, { variantCode: e.target.value.toUpperCase() })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs font-mono"
                placeholder="Mã variant"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Tên SP</label>
            <input
                value={line.productName}
                onChange={(e) => onPatch(line.id, { productName: e.target.value })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs"
                placeholder="Tên SP"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Tên variant</label>
            <input
                value={line.variantName}
                onChange={(e) => onPatch(line.id, { variantName: e.target.value })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs"
                placeholder="Tên variant"
            />
          </div>
        </div>

        {/* Row 3: category + new unit */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Danh mục</label>
            <SearchableCombobox
                className="mt-0.5"
                value={line.category || resolvedCategoryName}
                onChange={(v) => onPatch(line.id, { category: v })}
                placeholder="Danh mục"
                options={categoryOptions}
                onCreateNew={(q) => onCreateCategory(line.id, q)}
                createLabel="Tạo danh mục mới"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">ĐV SP mới</label>
            <input
                value={line.newProductUnit}
                onChange={(e) => onPatch(line.id, { newProductUnit: e.target.value })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs"
                placeholder="ĐV SP mới"
            />
          </div>
        </div>

        {/* Row 4: qty + units + conversion */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Số lượng *</label>
            <input
                type="number" min={0} step="any"
                data-testid={`goods-receipt-line-quantity-${line.id}`}
                value={line.quantity}
                onChange={(e) => onPatch(line.id, { quantity: Math.max(0, Number(e.target.value)) })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-xs font-mono tabular-nums", line.quantity <= 0 && "border-danger")}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">ĐV nhập *</label>
            <input
                value={line.importUnit}
                onChange={(e) => onPatch(line.id, { importUnit: e.target.value })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs", !line.importUnit.trim() && "border-danger")}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">ĐV bán *</label>
            <input
                value={line.sellUnit}
                onChange={(e) => onPatch(line.id, { sellUnit: e.target.value })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs", !line.sellUnit.trim() && "border-danger")}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Quy đổi *</label>
            <input
                type="number" min={1}
                value={line.piecesPerUnit}
                onChange={(e) => onPatch(line.id, { piecesPerUnit: Number(e.target.value) })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-xs font-mono tabular-nums", line.piecesPerUnit <= 0 && "border-danger")}
            />
          </div>
        </div>

        {/* Row 5: prices + discount */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Giá nhập (₫) *</label>
            <input
                type="number" min={0} step={1000}
                value={line.unitCost}
                onChange={(e) => onPatch(line.id, { unitCost: Math.max(0, Number(e.target.value)) })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-xs font-mono tabular-nums", line.unitCost <= 0 && "border-danger")}
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Giá bán (₫)</label>
            <input
                type="number" min={0} step={1000}
                value={line.sellPrice}
                onChange={(e) => onPatch(line.id, { sellPrice: Math.max(0, Number(e.target.value)) })}
                className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-xs font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase text-muted-foreground">Chiết khấu (%)</label>
            <input
                type="number" min={0} max={100}
                value={line.discountPercent}
                onChange={(e) => onPatch(line.id, { discountPercent: Number(e.target.value) })}
                className={cn("mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-xs font-mono tabular-nums", (line.discountPercent < 0 || line.discountPercent > 100) && "border-danger")}
            />
          </div>
        </div>

        {/* Row 6: HSD */}
        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Hạn sử dụng</label>
          <div className="mt-0.5 inline-flex rounded-md border bg-muted/40 p-0.5 text-[10px]">
            <button type="button" onClick={() => onPatch(line.id, { expiryMode: "date" })} className={cn("rounded px-2 py-0.5", line.expiryMode === "date" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>Ngày HSD</button>
            <button type="button" onClick={() => onPatch(line.id, { expiryMode: "days" })} className={cn("rounded px-2 py-0.5", line.expiryMode === "days" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>Số ngày SD</button>
          </div>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <DateInput
                  allowFuture
                  value={line.expiryDate}
                  onChange={(v) => onPatch(line.id, { expiryDate: v, expiryMode: "date" })}
                  className={cn("h-8 w-full text-xs", line.expiryMode === "date" ? "ring-1 ring-ring/40" : "opacity-70")}
              />
              <div className="mt-0.5 text-[9px] text-muted-foreground">Ngày HSD</div>
            </div>
            <div>
              <input
                  type="number" min={0}
                  value={line.expiryDays}
                  onChange={(e) => onPatch(line.id, { expiryDays: Math.max(0, Number(e.target.value)), expiryMode: "days" })}
                  className={cn("h-8 w-full rounded-md border bg-card px-2 text-right text-xs font-mono tabular-nums", line.expiryMode === "days" && line.expiryDays <= 0 && "border-danger", line.expiryMode === "days" ? "ring-1 ring-ring/40" : "opacity-70")}
                  placeholder="Số ngày"
              />
              <div className="mt-0.5 text-[9px] text-muted-foreground">Số ngày SD</div>
            </div>
          </div>
          {line.expiryMode === "days" && line.expiryDays > 0 && (
              <div className="mt-1 text-[10px] text-muted-foreground">≈ HSD ước tính: {computePreviewDate(line) || "—"}</div>
          )}
        </div>

        {/* Row 7: note */}
        <div>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Ghi chú</label>
          <input
              value={line.note}
              onChange={(e) => onPatch(line.id, { note: e.target.value })}
              className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-xs"
              placeholder="Ghi chú riêng cho dòng này"
          />
        </div>

        {/* Row 8: original issues */}
        <div className="rounded-md border bg-background p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Cảnh báo / lỗi gốc</div>
          <IssueDetails issue={issue} />
        </div>

        <div className="flex justify-end">
          <button
              onClick={() => onCollapse(line.id)}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
          >
            <ChevronUp className="h-3 w-3" /> Thu gọn
          </button>
        </div>
      </div>
  );
}

interface LineSummaryCardProps {
  line: ReceiptLineDraft;
  index: number;
  issue: LineIssue;
  display: LineDisplay;
  isExpanded: boolean;
  showDetails: boolean;
  isSaving: boolean;
  sellableLabel: string | null;
  onToggleExpand: (lineId: string) => void;
  onToggleIssueDetail: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
  registerRef: (lineId: string, el: HTMLDivElement | null) => void;
  editorNode: React.ReactNode;
}

function LineSummaryCard({
                           line,
                           index,
                           issue,
                           display,
                           isExpanded,
                           showDetails,
                           isSaving,
                           sellableLabel,
                           onToggleExpand,
                           onToggleIssueDetail,
                           onRemoveLine,
                           registerRef,
                           editorNode,
                         }: LineSummaryCardProps) {
  const hasError = issue.errors.length > 0;
  const hasWarning = !hasError && issue.warnings.length > 0;
  const lineSubtotal = line.unitCost * line.quantity * (1 - line.discountPercent / 100);
  const issueCount = issue.errors.length + issue.warnings.length;

  // Compact grid template:
  //   STT | Tên SP | Tên variant | Danh mục | Số lượng | Giá nhập/bán | HSD | Thành tiền | Status/actions
  const xlGrid =
      "xl:grid xl:items-start xl:gap-3 " +
      "xl:[grid-template-columns:52px_minmax(170px,1.4fr)_minmax(170px,1.2fr)_minmax(150px,.9fr)_minmax(150px,1fr)_minmax(180px,1fr)_110px_120px_190px]";

  return (
      <div
          ref={(el) => registerRef(line.id, el)}
          className={cn(
              "rounded-lg border bg-card transition-colors",
              hasError && "border-l-4 border-l-danger",
              hasWarning && "border-l-4 border-l-warning",
              !hasError && !hasWarning && "border-l-4 border-l-transparent",
              isExpanded && "ring-1 ring-ring/30",
          )}
      >
        {/* COMPACT ROW
            - mobile (<640): single column stack
            - tablet (640-1279): 2-col grid with friendly wrapping
            - desktop (>=1280): table-like 9-col grid
        */}
        <div
            className={cn(
                "p-3 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2",
                xlGrid,
            )}
        >
          {/* STT */}
          <CompactField label="STT" className="sm:col-span-2 xl:col-span-1">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] leading-tight text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">#{index + 1}</span>
              {line.sourceRow > 0 && <span className="text-[9px]">XL {line.sourceRow}</span>}
            </div>
          </CompactField>

          {/* Product */}
          <CompactField label="Tên SP">
            <div className="truncate text-sm font-semibold text-foreground" title={display.productName}>
              {display.productName
                  ? display.productName
                  : <span className="italic font-normal text-muted-foreground">— chưa có tên —</span>}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              <span className="uppercase tracking-wide">Mã SP:</span>{" "}
              {display.productCode
                  ? <span className="font-mono text-foreground">{display.productCode}</span>
                  : <span className="text-danger">— trống —</span>}
            </div>
          </CompactField>

          {/* Variant */}
          <CompactField label="Tên variant">
            <div className="truncate text-xs text-foreground" title={display.variantName}>
              {display.variantName ? display.variantName : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              <span className="uppercase tracking-wide">Mã variant:</span>{" "}
              {display.variantCode
                  ? <span className="font-mono text-foreground">{display.variantCode}</span>
                  : <span className="italic">— default —</span>}
            </div>
          </CompactField>

          {/* Category */}
          <CompactField label="Danh mục">
            {display.categoryName ? (
                <span
                    className="inline-flex h-5 max-w-full items-center truncate rounded-full bg-muted px-2 text-[11px] font-medium text-foreground"
                    title={display.categoryName}
                >
                  {display.categoryName}
                </span>
            ) : (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-warning-soft px-2 text-[10px] font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" /> Thiếu danh mục
                </span>
            )}
          </CompactField>

          {/* Quantity */}
          <CompactField label="Số lượng">
            <div className="truncate font-mono text-[11px] tabular-nums" title={formatLineUnitSummary(line)}>
              {formatLineUnitSummary(line)}
            </div>
          </CompactField>

          {/* Price one-line */}
          <CompactField label="Giá nhập / bán / chiết khấu">
            <div className="flex flex-wrap gap-x-1 font-mono text-[11px] tabular-nums xl:flex-nowrap xl:whitespace-nowrap">
              <span>Nhập {formatVND(line.unitCost)}</span>
              <span className="text-muted-foreground">· Bán {formatVND(line.sellPrice)}</span>
              <span className="text-muted-foreground">· CK {Number.isFinite(Number(line.discountPercent)) ? Number(line.discountPercent) : 0}%
</span>
            </div>
          </CompactField>

          {/* HSD */}
          <CompactField label="HSD">
            <div className="truncate text-[11px]">{formatLineHsdSummary(line)}</div>
          </CompactField>

          {/* Subtotal */}
          <CompactField label="Thành tiền" align="right">
            <div className="truncate font-mono text-[12px] font-semibold tabular-nums">{formatVND(lineSubtotal)}</div>
          </CompactField>

          {/* Status + actions */}
          <div className="sm:col-span-2 xl:col-span-1 flex flex-col gap-1">
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none xl:text-right">
              Trạng thái
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 xl:justify-end">
              <span
                  className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      line.status === "error" && "bg-danger-soft text-danger",
                      line.status === "warning" && "bg-warning-soft text-warning",
                      line.status === "ready" && "bg-success-soft text-success",
                  )}
                  title={line.message ?? ""}
              >
                {line.status === "error" ? <AlertCircle className="h-2.5 w-2.5" /> : line.status === "warning" ? <AlertTriangle className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
                {outcomeChipLabel(line.outcome)}
              </span>
              {line.edited && (
                  <span className="inline-flex items-center rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">đã sửa</span>
              )}
              <IssueChips issue={issue} />
            </div>
            <div className="flex flex-wrap items-center gap-1 xl:justify-end">
              {issueCount > 0 && (
                  <button
                      type="button"
                      onClick={() => onToggleIssueDetail(line.id)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {showDetails ? "Ẩn lỗi" : "Chi tiết lỗi"}
                  </button>
              )}
              <button
                  type="button"
                  onClick={() => onToggleExpand(line.id)}
                  className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
                      isExpanded ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                  )}
              >
                <Pencil className="h-3 w-3" />
                {isExpanded ? "Thu gọn" : "Sửa"}
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <button
                  type="button"
                  onClick={() => onRemoveLine(line.id)}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-md border p-1.5 text-muted-foreground hover:bg-muted hover:text-danger disabled:opacity-50"
                  title="Xóa dòng"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {sellableLabel && (
                <div className="text-[10px] text-muted-foreground xl:text-right">{sellableLabel}</div>
            )}
          </div>
        </div>

        {/* Issue detail panel */}
        {showDetails && issueCount > 0 && (
            <div className="border-t bg-muted/30 px-3 py-2">
              <IssueDetails issue={issue} />
            </div>
        )}

        {/* Expanded editor */}
        {isExpanded && (
            <div className="border-t bg-background/40 p-2.5">
              {editorNode}
            </div>
        )}
      </div>
  );
}

// ============================================================================
// Main page component
// ============================================================================

export default function AdminGoodsReceiptCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const draftId = params.get("draft");
  const isImportMode = params.get("mode") === "import";
  const { data: supplierRows, reload: reloadSuppliers } = useService(() => adminSuppliers.list({ pageSize: 200 }), []);
  const { data: categoryData, reload: reloadCategories } = useService(() => categoryService.list({ includeInactive: true, pageSize: 500 }), []);
  const suppliers = supplierRows?.items ?? [];
  const categories = categoryData?.items ?? [];
  const [lines, setLines] = useState<ReceiptLineDraft[]>(initialLines);
  const [supplier, setSupplier] = useState("");
  const [shippingFee, setShippingFee] = useState(50000);
  const [vat, setVat] = useState(10);
  const [note, setNote] = useState("");
  const [receiptDate, setReceiptDate] = useState(localToday());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [savedReceiptId, setSavedReceiptId] = useState<number | null>(null);
  const [draftNumber, setDraftNumber] = useState<string | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeItems, setBarcodeItems] = useState<BarcodeItem[]>([]);
  const [backendCatalog, setBackendCatalog] = useState<Product[]>([]);
  const [supplierDrawerOpen, setSupplierDrawerOpen] = useState(false);
  const [supplierSeedName, setSupplierSeedName] = useState("");
  const [importedFilename, setImportedFilename] = useState<string | null>(null);
  const [validationTick, setValidationTick] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [issueDetailIds, setIssueDetailIds] = useState<Set<string>>(new Set());
  const [onlyActionable, setOnlyActionable] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const registerRowRef = (id: string, el: HTMLDivElement | null) => {
    rowRefs.current[id] = el;
  };

  useEffect(() => {
    if (!isImportMode) return;
    const stage = importStaging.takeReceipt();
    if (!stage) return;
    const nextDate = stage.meta?.receiptDate || localToday();
    setReceiptDate(nextDate);
    setImportedFilename(stage.filename);
    setSupplier("");
    setLines(revalidateLines(stage.rows.map((row, i) => convertImportedRow(row, nextDate, i))));
    toast.success(`Đã nạp ${stage.rows.length} dòng từ ${stage.filename}.`);
  }, [isImportMode]);

  useEffect(() => {
    if (!draftId) return;
    const draft = draftActions.get(draftId);
    if (!draft) return;
    const mapped: ReceiptLineDraft[] = draft.lines.map((line: any, index: number) => ({
      id: line.id || createLineId(`draft-${index}`),
      sourceRow: 0,
      status: "ready" as ImportSeverity,
      outcome: "ok" as ReceiptImportOutcome,
      message: undefined,
      productCode: line.variantCode,
      variantCode: line.variantCode,
      productId: Number.isFinite(Number(line.productId)) ? Number(line.productId) : undefined,
      variantId: Number.isFinite(Number(line.variantId)) ? Number(line.variantId) : undefined,
      productName: line.productName,
      variantName: line.variantName,
      category: "",
      newProductUnit: "",
      importUnit: line.importUnit,
      sellUnit: line.sellUnit || line.importUnit,
      piecesPerUnit: line.piecesPerUnit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      sellPrice: 0,
      discountPercent: Number.isFinite(Number(line.discount)) ? Number(line.discount) : 0,
      expiryDate: line.expiryDate || "",
      expiryDays: line.expiryDays || 0,
      expiryMode: line.expiryDays ? "days" : "date",
      note: "",
      fromImport: false,
      isSellable: true,
      isSellableExplicit: false,
    }));
    setLines(revalidateLines(mapped));
    setSupplier(draft.supplierId);
    setShippingFee(draft.shippingFee);
    setVat(draft.vat);
    setNote(draft.note);
    setReceiptDate(draft.receiptDate);
    setDraftNumber(draft.number);
    setCurrentDraftId(draft.id);
    toast.info(`Đã mở phiếu nháp ${draft.number}.`);
  }, [draftId]);

  const supplierOptions = useMemo(
      () => suppliers.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, sub: `${s.code} · ${s.phone}` })),
      [suppliers]
  );
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(String(c.id), c.name));
    return m;
  }, [categories]);
  const categoryOptions = useMemo(
      () => categories.map((c) => ({ id: c.name, label: c.name, sub: c.active ? undefined : "Đã ẩn" })),
      [categories]
  );

  const lineIssues = useMemo(() => {
    const map = new Map<string, LineIssue>();
    lines.forEach((l) => map.set(l.id, validateImportedLine(l)));
    return map;
  }, [lines, validationTick]);

  const stats = useMemo(() => {
    let err = 0, warn = 0, ok = 0, edited = 0;
    lines.forEach((l) => {
      const i = lineIssues.get(l.id) ?? { errors: [], warnings: [] };
      if (i.errors.length) err += 1;
      else if (i.warnings.length) warn += 1;
      else ok += 1;
      if (l.edited) edited += 1;
    });
    return { total: lines.length, err, warn, ok, edited };
  }, [lines, lineIssues]);

  const importedLineCount = lines.filter((l) => l.fromImport).length;
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.unitCost * l.quantity * (1 - l.discountPercent / 100), 0), [lines]);
  const vatAmount = subtotal * vat / 100;
  const total = subtotal + shippingFee + vatAmount;
  const today = localToday();
  const futureDateError = receiptDate > today;
  const missingSupplier = !supplier;
  const canSave = lines.length > 0 && !missingSupplier && !futureDateError && stats.err === 0 && !isSaving;

  const filteredLines = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter((l) => {
      const issue = lineIssues.get(l.id) ?? { errors: [], warnings: [] };
      const status: "error" | "warning" | "ok" = issue.errors.length ? "error" : issue.warnings.length ? "warning" : "ok";
      if (onlyActionable && status === "ok") return false;
      if (filter === "error" && status !== "error") return false;
      if (filter === "warning" && status !== "warning") return false;
      if (filter === "ok" && status !== "ok") return false;
      if (filter === "edited" && !l.edited) return false;
      if (!needle) return true;
      const hay = `${l.productCode} ${l.variantCode} ${l.productName} ${l.variantName} ${l.category}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [lines, lineIssues, filter, search, onlyActionable]);

  const syncLine = (id: string, patch: Partial<ReceiptLineDraft>) => {
    setLines((prev) => revalidateLines(prev.map((l) => {
      if (l.id !== id) return l;
      const merged: ReceiptLineDraft = { ...l, ...patch, edited: true };
      return hydrateLineFromCatalog(merged, categoryNameById);
    })));
  };

  const computePreviewDate = (line: ReceiptLineDraft) => {
    if (line.expiryMode !== "days" || line.expiryDays <= 0) return "";
    if (Number.isNaN(parseLocalDateInput(receiptDate).getTime())) return "";
    return addLocalCalendarDays(receiptDate, line.expiryDays);
  };

  const handleRevalidate = () => {
    if (isSaving) return;
    setLines((prev) => revalidateLines(prev));
    setValidationTick((v) => v + 1);
    toast.info("Đã revalidate.");
  };

  const removeLine = (id: string) => {
    if (isSaving) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
    setExpandedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setIssueDetailIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseLine = (id: string) => {
    setExpandedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleIssueDetail = (id: string) => {
    setIssueDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
    setIssueDetailIds(new Set());
  };

  const expandFirstError = () => {
    const found = lines.find((l) => {
      const i = lineIssues.get(l.id) ?? { errors: [], warnings: [] };
      return i.errors.length > 0;
    });
    if (!found) { toast.info("Không có dòng lỗi."); return; }
    setFilter("all");
    setExpandedIds((prev) => { const n = new Set(prev); n.add(found.id); return n; });
    setTimeout(() => rowRefs.current[found.id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const jumpToFirst = (target: "error" | "warning") => {
    const found = lines.find((l) => {
      const i = lineIssues.get(l.id) ?? { errors: [], warnings: [] };
      const s: "error" | "warning" | "ok" = i.errors.length ? "error" : i.warnings.length ? "warning" : "ok";
      return s === target;
    });
    if (!found) return;
    setFilter(target);
    setTimeout(() => rowRefs.current[found.id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const handleSaveDraft = () => {
    if (isSaving) return;
    if (lines.length === 0) { toast.error("Chưa có dòng nào."); return; }
    const supplierName = suppliers.find((s) => s.id === supplier)?.name ?? "— Chưa chọn NCC —";
    const number = draftNumber ?? `DRAFT-${receiptDate.replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
    const saved = draftActions.save({
      id: currentDraftId ?? undefined, number, supplierId: supplier, supplierName, receiptDate, shippingFee, vat, note,
      lines: lines.map((l) => ({
        id: l.id, productName: l.productName, variantName: l.variantName,
        variantCode: l.variantCode || l.productCode, quantity: l.quantity,
        unitCost: l.unitCost, discount: l.discountPercent,
        importUnit: l.importUnit, sellUnit: l.sellUnit, piecesPerUnit: l.piecesPerUnit,
        expiryDate: l.expiryDate, expiryDays: l.expiryDays,
      })),
    });
    setDraftNumber(saved.number);
    setCurrentDraftId(saved.id);
    toast.success(`Đã lưu nháp ${saved.number}.`);
  };

  useEffect(() => {
    if (!isImportMode && !draftId) {
      validationCatalog = [];
      setBackendCatalog([]);
      return;
    }
    let cancel = false;
    void (async () => {
      if (!getAdminSession()?.accessToken) return;
      try {
        const pg = await productService.list({ pageSize: 500 });
        if (!cancel) {
          validationCatalog = pg.items;
          setBackendCatalog(pg.items);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [draftId, isImportMode]);

  // Re-hydrate lines whenever backend catalog or DB categories change.
  useEffect(() => {
    setLines((prev) => revalidateLines(prev.map((l) => hydrateLineFromCatalog(l, categoryNameById))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendCatalog, categoryNameById]);

  const catalogProducts = useMemo(() => {
    return backendCatalog;
  }, [backendCatalog]);

  const addLineFromVariantSearchHit = (hit: VariantTransactionSearchHit) => {
    if (isSaving) return;
    const hitProductId = Number(hit.productId);
    const hitVariantId = Number(hit.variantId);
    const next: ReceiptLineDraft = {
      id: createLineId("manual"),
      sourceRow: 0,
      status: "warning",
      outcome: "update-pricing",
      message: "Đã chọn từ tìm kiếm variant.",
      productCode: hit.productCode,
      variantCode: hit.variantCode,
      productId: Number.isFinite(hitProductId) ? hitProductId : undefined,
      variantId: Number.isFinite(hitVariantId) ? hitVariantId : undefined,
      productName: hit.productName,
      variantName: hit.variantName,
      category: hit.categoryName ?? "",
      newProductUnit: "",
      importUnit: hit.importUnit?.trim() ? hit.importUnit : "Cái",
      sellUnit: hit.sellUnit?.trim() ? hit.sellUnit : "Cái",
      piecesPerUnit: Math.max(1, hit.piecesPerUnit ?? 1),
      quantity: 1,
      unitCost: Math.max(0, hit.costPrice ?? 0),
      sellPrice: Math.max(0, hit.sellPrice ?? 0),
      discountPercent: 0,
      expiryDate: "",
      expiryDays: 0,
      expiryMode: "date",
      note: "",
      fromImport: false,
      isSellable: hit.isSellable ?? true,
      isSellableExplicit: false,
    };
    setLines((prev) => revalidateLines([...prev, next]));
    setExpandedIds((prev) => { const n = new Set(prev); n.add(next.id); return n; });
  };

  function findCatalogVariant(line: ReceiptLineDraft): { product: Product; variant: ProductVariant } | null {
    const p = catalogProducts.find((x) => x.code.toUpperCase() === line.productCode.trim().toUpperCase());
    if (!p) return null;
    if (!line.variantCode.trim()) {
      const v = p.variants.find((x) => x.isDefault) ?? p.variants[0];
      return v ? { product: p, variant: v } : null;
    }
    const v = p.variants.find((x) => x.code.toUpperCase() === line.variantCode.trim().toUpperCase());
    return v ? { product: p, variant: v } : null;
  }

  function effectiveExpiryIso(line: ReceiptLineDraft): string | null {
    if (line.expiryMode === "date" && line.expiryDate.trim()) return line.expiryDate.trim();
    const preview = computePreviewDate(line);
    return preview || null;
  }

  function lineRetailQty(line: ReceiptLineDraft): number {
    return Math.max(0, line.quantity) * Math.max(1, line.piecesPerUnit);
  }

  function buildReceiptItems(): InventoryReceiptCreateItem[] | null {
    const out: InventoryReceiptCreateItem[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const identity = resolveReceiptLineIdentity(line, () => {
        const hit = findCatalogVariant(line);
        return hit ? { productId: Number(hit.product.id), variantId: Number(hit.variant.id) } : null;
      });
      if (!identity) {
        const hit = findCatalogVariant(line);
        const fallback = hit
            ? { productId: Number(hit.product.id), variantId: Number(hit.variant.id) }
            : null;
        const msg = buildReceiptIdentityMissingToast(line, idx, fallback);
        console.error("[GoodsReceiptCreate] Không resolve được identity", { line, hit });
        toast.error(msg);
        return null;
      }
      const pid = identity.productId;
      const oid = identity.variantId;
      if (!Number.isFinite(oid) || !Number.isFinite(pid)) {
        const msg = buildReceiptIdentityInvalidToast(line, idx, { productId: pid, variantId: oid });
        console.error("[GoodsReceiptCreate] productId/variantId không hợp lệ", { line, identity });
        toast.error(msg);
        return null;
      }
      out.push({
        productId: pid,
        quantity: line.quantity,
        unitCost: Math.max(0, line.unitCost),
        discountPercent: Math.max(0, Math.min(100, line.discountPercent)),
        sellPrice: Number.isFinite(line.sellPrice) ? Math.max(0, line.sellPrice) : null,
        isSellable: line.isSellable ?? null,
        isSellableExplicit: line.fromImport ? Boolean(line.isSellableExplicit) : false,
        importUnit: line.importUnit.trim(),
        piecesOverride: Math.max(1, line.piecesPerUnit),
        variantId: oid,
        expiryDateOverride: effectiveExpiryIso(line),
      });
    }
    return out;
  }

  function matchBatchForLine(
      line: ReceiptLineDraft,
      receiptItem: InventoryReceiptItemResponse,
      batches: ProductBatchResponse[],
  ): ProductBatchResponse | null {
    const exp = effectiveExpiryIso(line);
    const pid = receiptItem.productId;
    const rq = receiptItem.retailQtyAdded ?? lineRetailQty(line);
    const candidates = batches.filter((b) => b.productId === pid);
    const narrowed =
        exp != null
            ? candidates.filter((b) => (b.expiryDate ?? "").slice(0, 10) === exp.slice(0, 10))
            : candidates;
    const vMatch = narrowed.filter((b) => {
      const codePrefix = `${(line.variantCode || line.productCode || "").toUpperCase()}`;
      return codePrefix ? b.batchCode.toUpperCase().includes(codePrefix) : true;
    });
    const pool = vMatch.length ? vMatch : narrowed.length ? narrowed : candidates;
    const byQty = pool.find((b) => b.importQty === rq);
    return byQty ?? pool[0] ?? null;
  }

  const handleSave = () => {
    if (isSaving) return;
    if (!canSave) {
      if (futureDateError) toast.error("Ngày nhập không thể ở tương lai.");
      else if (missingSupplier) toast.error("Vui lòng chọn nhà cung cấp.");
      else toast.error("Còn lỗi blocking trong danh sách hàng.");
      return;
    }

    void (async () => {
      const toastId = "goods-receipt-save";
      setIsSaving(true);
      if (!getAdminSession()?.accessToken) {
        toast.error(
            "Không có phiên admin hợp lệ — không thể lưu phiếu nhập lên máy chủ (JWT hết hạn hoặc chưa đăng nhập).",
            { id: toastId },
        );
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        setIsSaving(false);
        return;
      }

      try {
        setBarcodeItems([]);

        const items = buildReceiptItems();
        if (!items) {
          // buildReceiptItems đã toast.error chi tiết (productId/variantId) — đảm bảo không có spinner treo.
          toast.dismiss(toastId);
          return;
        }
        const supplierIdNum = supplier ? Number(supplier) : NaN;
        if (!Number.isFinite(supplierIdNum)) {
          toast.error("supplierId không hợp lệ — cần NCC có id số từ backend.", { id: toastId });
          return;
        }
        // Chỉ bật spinner sau khi đã qua tất cả validation đồng bộ — tránh treo loading nếu fail sớm.
        toast.loading("Đang lưu phiếu nhập...", { id: toastId });
        const now = new Date();
        const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        const receiptDateTime = `${receiptDate}T${t}`;

        const created = await createInventoryReceipt({
          supplierId: supplierIdNum,
          supplierName: suppliers.find((s) => s.id === supplier)?.name ?? null,
          note: note.trim() || null,
          shippingFee,
          vatPercent: vat,
          items,
          comboItems: [],
          receiptDate: receiptDateTime,
        });
        setSavedReceiptId(created.id);
        setSavedNumber(created.receiptNo);
        if (currentDraftId) {
          draftActions.remove(currentDraftId);
          setCurrentDraftId(null);
          setDraftNumber(null);
        }
        toast.success(`Đã lưu phiếu nhập ${created.receiptNo} (backend).`, { id: toastId });

        try {
          const batches = await fetchBatchesByReceiptId(created.id);
          const nextLabels: BarcodeItem[] = [];
          for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            const beItem = created.items[i];
            if (!beItem) continue;
            const batch = matchBatchForLine(line, beItem, batches);
            if (!batch?.id) {
              toast.warning(`Không map được lô backend cho dòng ${line.productCode} — bỏ qua tem lô.`);
              continue;
            }
            nextLabels.push({
              productName: line.productName,
              variantName: line.variantName,
              code: `BATCH:${batch.id}`,
              price: line.sellPrice,
              lot: batch.batchCode,
              expiryDate: (batch.expiryDate ?? effectiveExpiryIso(line) ?? "").slice(0, 10),
              defaultQty: lineRetailQty(line),
            });
          }
          setBarcodeItems(nextLabels);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Đã lưu phiếu nhưng không tải được danh sách lô để in tem.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lưu phiếu nhập backend thất bại", { id: toastId });
      } finally {
        setIsSaving(false);
      }
    })();
  };

  const supplierName = suppliers.find((s) => s.id === supplier)?.name ?? "";

  const handleCreateCategoryForLine = (lineId: string, query: string) => {
    const name = query.trim();
    if (!name) return;
    categoryService.create({ name, description: "Tạo từ phiếu nhập" })
        .then(() => { reloadCategories(); syncLine(lineId, { category: name }); toast.success(`Đã tạo "${name}".`); })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Không thể tạo danh mục"));
  };

  // ---- Render ----
  return (
      <div className="admin-dense space-y-3 pb-24 lg:pb-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/admin/goods-receipts" className="hover:text-foreground">Phiếu nhập</Link>
          <ChevronRight className="h-3 w-3" />
          <span>Tạo phiếu nhập</span>
          {isImportMode && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-foreground">Import từ Excel</span>
              </>
          )}
        </nav>

        {/* Top summary strip */}
        {(isImportMode || lines.length > 0) && (
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {importedFilename && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-info-soft px-2 py-1 text-[11px] font-medium text-info">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {importedFilename}
                </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {stats.total} dòng · {importedLineCount} từ Excel
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <label
                      className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                          onlyActionable ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
                      )}
                  >
                    <Filter className="h-3 w-3" />
                    <span>Chỉ dòng cần xử lý</span>
                    <input type="checkbox" className="sr-only" checked={onlyActionable} onChange={(e) => setOnlyActionable(e.target.checked)} />
                  </label>
                  <button
                      onClick={() => setFilter("all")}
                      className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          filter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
                      )}
                  >
                    Tất cả <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.total}</span>
                  </button>
                  <button
                      onClick={() => setFilter("error")}
                      className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          filter === "error" ? "bg-danger text-danger-foreground border-danger" : "bg-danger-soft text-danger hover:bg-danger/10",
                      )}
                  >
                    <AlertCircle className="h-3 w-3" /> Lỗi <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.err}</span>
                  </button>
                  <button
                      onClick={() => setFilter("warning")}
                      className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          filter === "warning" ? "bg-warning text-warning-foreground border-warning" : "bg-warning-soft text-warning hover:bg-warning/10",
                      )}
                  >
                    <AlertTriangle className="h-3 w-3" /> Cảnh báo <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.warn}</span>
                  </button>
                  <button
                      onClick={() => setFilter("ok")}
                      className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          filter === "ok" ? "bg-success text-success-foreground border-success" : "bg-card hover:bg-muted",
                      )}
                  >
                    Hợp lệ <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.ok}</span>
                  </button>
                  <button
                      onClick={() => setFilter("edited")}
                      className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          filter === "edited" ? "bg-info text-info-foreground border-info" : "bg-card hover:bg-muted",
                      )}
                  >
                    Đã sửa <span className="rounded-full bg-background/20 px-1.5 text-[10px]">{stats.edited}</span>
                  </button>
                  <button
                      onClick={handleRevalidate}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" /> Revalidate
                  </button>
                </div>
              </div>
            </div>
        )}

        {savedNumber && (
            <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-soft p-2.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Đã lưu phiếu nhập <strong>{savedNumber}</strong>
              {savedReceiptId != null && <span className="text-muted-foreground">· backend #{savedReceiptId}</span>}.
            </div>
        )}

        {/* Layout: side-by-side only from xl (>=1280). Below xl, content is full
            width and the right summary stacks underneath. This fixes iPad
            Pro 1024px squishing. */}
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-3">
          <div className="min-w-0 space-y-3">
            {/* Metadata */}
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Metadata phiếu nhập</h3>
                <span className="text-[10px] text-muted-foreground">NCC + Ngày là bắt buộc</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="text-[10px] font-medium uppercase text-muted-foreground">Ngày nhập *</label>
                  <DateInput value={receiptDate} onChange={(v) => { setReceiptDate(v); setLines((prev) => revalidateLines(prev)); }} className={cn("mt-0.5 h-8 w-full", futureDateError && "border-danger")} />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase text-muted-foreground">Nhà cung cấp *</label>
                  <SearchableCombobox
                      className="mt-0.5"
                      value={supplier}
                      onChange={setSupplier}
                      invalid={missingSupplier}
                      placeholder="Tìm hoặc tạo NCC"
                      options={supplierOptions}
                      onCreateNew={(q) => { setSupplierSeedName(q); setSupplierDrawerOpen(true); }}
                      createLabel="Tạo NCC mới"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase text-muted-foreground">Phí vận chuyển</label>
                  <input type="number" value={shippingFee} onChange={(e) => setShippingFee(Number(e.target.value))} className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-sm font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase text-muted-foreground">VAT (%)</label>
                  <input type="number" value={vat} onChange={(e) => setVat(Number(e.target.value))} className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-right text-sm font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-[10px] font-medium uppercase text-muted-foreground">Ghi chú</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              {missingSupplier && <p className="mt-1.5 text-[10px] text-danger">Chưa chọn NCC.</p>}
              {!!supplierName && <p className="mt-1.5 text-[10px] text-muted-foreground">Đang chọn: <strong>{supplierName}</strong></p>}
            </div>

            {/* Search + add manual */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm dòng theo mã SP, mã variant, tên, danh mục..."
                    className="h-8 w-full rounded-md border bg-card pl-8 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                )}
              </div>
              <div className="relative z-40 min-w-[12rem] max-w-[22rem] flex-1">
                <VariantSearchPicker
                    context="receipt"
                    disabled={isSaving}
                    placeholder="Thêm dòng từ kho — tìm SP / variant (backend)…"
                    inputTestId="goods-receipt-variant-search"
                    listTestId="goods-receipt-variant-search-hits"
                    onSelect={(hit) => addLineFromVariantSearchHit(hit)}
                />
              </div>
              <button onClick={() => setImportOpen(true)} disabled={isSaving} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" /> Excel
              </button>
            </div>

            {/* Compact review list */}
            <div className="space-y-2">
              {filteredLines.map((line, index) => {
                const issue = lineIssues.get(line.id) ?? { errors: [], warnings: [] };
                const display = getLineDisplay(line, categoryNameById);
                const isExpanded = expandedIds.has(line.id);
                const showDetails = issueDetailIds.has(line.id);
                const sellableLabel = line.fromImport && (line.isSellable !== undefined || line.isSellableInvalid)
                    ? receiptImportRowSellableLabel({ isSellable: line.isSellable, isSellableInvalid: line.isSellableInvalid })
                    : null;
                const editorNode = isExpanded ? (
                    <LineEditor
                        line={line}
                        issue={issue}
                        categoryOptions={categoryOptions}
                        isSaving={isSaving}
                        resolvedCategoryName={display.categoryName}
                        computePreviewDate={computePreviewDate}
                        onPatch={syncLine}
                        onCreateCategory={handleCreateCategoryForLine}
                        onCollapse={collapseLine}
                    />
                ) : null;
                return (
                    <LineSummaryCard
                        key={line.id}
                        line={line}
                        index={index}
                        issue={issue}
                        display={display}
                        isExpanded={isExpanded}
                        showDetails={showDetails}
                        isSaving={isSaving}
                        sellableLabel={sellableLabel}
                        onToggleExpand={toggleExpand}
                        onToggleIssueDetail={toggleIssueDetail}
                        onRemoveLine={removeLine}
                        registerRef={registerRowRef}
                        editorNode={editorNode}
                    />
                );
              })}
              {filteredLines.length === 0 && (
                  <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
                    <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                    {lines.length === 0 ? "Chưa có dòng nhập nào." : "Không có dòng khớp bộ lọc."}
                  </div>
              )}
            </div>
          </div>

          {/* Right summary panel — stacks below content under xl */}
          <div className="mt-3 xl:mt-0 min-w-0">
            <div className="space-y-3 xl:sticky xl:top-20">
              {/* Tổng kết */}
              <div className="rounded-lg border bg-card p-3">
                <h3 className="mb-2 text-sm font-semibold">Tổng kết</h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Dòng hàng</span><span className="font-mono tabular-nums">{lines.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Từ Excel</span><span className="font-mono tabular-nums">{importedLineCount}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tạm tính</span><span className="font-mono tabular-nums">{formatVND(subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Phí ship</span><span className="font-mono tabular-nums">{formatVND(shippingFee)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT ({vat}%)</span><span className="font-mono tabular-nums">{formatVND(vatAmount)}</span></div>
                  <div className="flex justify-between border-t pt-1.5 text-sm font-bold"><span>Tổng</span><span className="font-mono tabular-nums text-primary">{formatVND(total)}</span></div>
                </div>
              </div>

              {/* Validation */}
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Validation</h4>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <button onClick={() => setFilter("ok")} className={cn("rounded-md bg-success-soft p-2 text-success hover:bg-success/10", filter === "ok" && "ring-2 ring-success/60")}>
                    <div className="text-base font-bold leading-none">{stats.ok}</div>
                    <div className="mt-0.5 text-[10px]">Hợp lệ</div>
                  </button>
                  <button onClick={() => setFilter("warning")} className={cn("rounded-md bg-warning-soft p-2 text-warning hover:bg-warning/10", filter === "warning" && "ring-2 ring-warning/60")}>
                    <div className="text-base font-bold leading-none">{stats.warn}</div>
                    <div className="mt-0.5 text-[10px]">Cảnh báo</div>
                  </button>
                  <button onClick={() => setFilter("error")} className={cn("rounded-md bg-danger-soft p-2 text-danger hover:bg-danger/10", filter === "error" && "ring-2 ring-danger/60")}>
                    <div className="text-base font-bold leading-none">{stats.err}</div>
                    <div className="mt-0.5 text-[10px]">Lỗi</div>
                  </button>
                </div>
              </div>

              {/* Cần xử lý */}
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Cần xử lý</h4>
                <div className="space-y-1.5">
                  <button
                      onClick={() => jumpToFirst("error")}
                      disabled={stats.err === 0}
                      className="flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-danger" /> Dòng lỗi đầu tiên</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                      onClick={() => jumpToFirst("warning")}
                      disabled={stats.warn === 0}
                      className="flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warning" /> Dòng cảnh báo đầu tiên</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                      onClick={expandFirstError}
                      disabled={stats.err === 0}
                      className="flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Mở dòng lỗi đầu tiên</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <label className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium",
                      onlyActionable ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}>
                    <span className="inline-flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /> Chỉ dòng cần xử lý</span>
                    <input type="checkbox" checked={onlyActionable} onChange={(e) => setOnlyActionable(e.target.checked)} className="h-3.5 w-3.5" />
                  </label>
                  <button
                      onClick={collapseAll}
                      disabled={expandedIds.size === 0 && issueDetailIds.size === 0}
                      className="flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-1.5"><ChevronUp className="h-3.5 w-3.5" /> Thu gọn tất cả</span>
                  </button>
                </div>
              </div>

              {/* Hành động */}
              <div className="rounded-lg border bg-card p-3">
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Hành động</h4>
                {!canSave && lines.length > 0 && !savedNumber && (
                    <div className="mb-2 rounded-md border border-warning/30 bg-warning-soft/40 p-2 text-[11px] text-warning">
                      <div className="mb-0.5 font-semibold">Chưa thể lưu:</div>
                      <ul className="space-y-0.5">
                        {missingSupplier && <li>• Chưa chọn nhà cung cấp</li>}
                        {futureDateError && <li>• Ngày nhập đang ở tương lai</li>}
                        {stats.err > 0 && <li>• Còn {stats.err} dòng lỗi blocking</li>}
                      </ul>
                    </div>
                )}
                {!savedNumber ? (
                    <div className="space-y-1.5">
                      <button
                          type="button"
                          data-testid="goods-receipt-save-submit"
                          onClick={handleSave}
                          disabled={!canSave}
                          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSaving ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...</>
                        ) : (
                            <><Save className="h-3.5 w-3.5" /> Lưu phiếu nhập</>
                        )}
                      </button>
                      <button onClick={handleSaveDraft} disabled={isSaving} className="flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
                        <FileText className="h-3.5 w-3.5" /> {currentDraftId ? "Cập nhật nháp" : "Lưu nháp"}
                      </button>
                      <button onClick={handleRevalidate} disabled={isSaving} className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
                        <RefreshCw className="h-3.5 w-3.5" /> Revalidate
                      </button>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                      <button
                          onClick={() => {
                            if (!barcodeItems.length) {
                              toast.error("Chưa có tem lô (BATCH:…). Hãy đăng nhập admin và lưu phiếu qua backend.");
                              return;
                            }
                            setBarcodeOpen(true);
                          }}
                          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                      >
                        <Printer className="h-3.5 w-3.5" /> In mã vạch
                      </button>
                      <button onClick={() => navigate("/admin/goods-receipts")} className="w-full rounded-md border py-1.5 text-xs font-medium hover:bg-muted">Về danh sách</button>
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ReceiptImportPreviewDialog open={importOpen} onClose={() => setImportOpen(false)} />
        <SupplierFormDrawer
            open={supplierDrawerOpen}
            onClose={() => setSupplierDrawerOpen(false)}
            supplier={undefined}
            onSave={async (input) => { await adminSuppliers.save({ ...input, name: input.name || supplierSeedName }); reloadSuppliers(); }}
        />
        <BarcodePrintDialog
            open={barcodeOpen}
            onClose={() => setBarcodeOpen(false)}
            title={`In mã vạch — ${savedNumber ?? draftNumber ?? "phiếu nhập"}`}
            items={barcodeItems}
        />
      </div>
  );
}
