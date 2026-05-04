import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, ArrowLeft, Check, ChevronRight, FileSpreadsheet,
  FileText, Package, Plus, Printer, RefreshCw, Save, Search, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { DateInput } from "@/components/shared/DateInput";
import { BarcodePrintDialog } from "@/components/shared/BarcodePrintDialog";
import { SearchableCombobox } from "@/components/shared/SearchableCombobox";
import { SupplierFormDrawer } from "@/components/shared/SupplierFormDrawer";
import { ReceiptImportPreviewDialog } from "@/components/shared/ReceiptImportPreviewDialog";
import { importStaging } from "@/lib/import-staging";
import { draftActions } from "@/lib/drafts";
import { formatVND } from "@/lib/format";
import { receiptImportRowSellableLabel, type ImportSeverity, type ReceiptImportOutcome, type ReceiptImportRow } from "@/lib/import-types";
import type { Product, ProductVariant } from "@/lib/catalog-types";
import { cn } from "@/lib/utils";
import { getAdminSession } from "@/services/auth/adminApi";
import { adminSuppliers, categories as categoryService, products as productService } from "@/services";
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
  isSellableInvalid?: boolean;
  importParserWarnings?: string[];
}

let validationCatalog: Product[] = [];

interface LineIssue { errors: string[]; warnings: string[]; }
type StatusFilter = "all" | "error" | "warning" | "ok" | "edited";

const initialLines: ReceiptLineDraft[] = [];

function createLineId(prefix = "line") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function convertImportedRow(row: ReceiptImportRow, _receiptDate: string, index: number): ReceiptLineDraft {
  // Preserve the ORIGINAL imported meaning. Do NOT auto-convert shelf-life days into a calendar date.
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
    discountPercent: row.discountPercent,
    expiryDate: hasDate ? row.expiryDate : "", // keep empty if Excel only had shelf-life days
    expiryDays: hasDays ? row.expiryDays! : 0,
    expiryMode,
    note: row.note || "",
    fromImport: true,
    isSellable: row.isSellable,
    isSellableInvalid: row.isSellableInvalid,
    importParserWarnings: row.importWarnings,
  };
}

function inferOutcome(line: ReceiptLineDraft): { outcome: ReceiptImportOutcome; message?: string } {
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

function validateImportedLine(line: ReceiptLineDraft): LineIssue {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!line.productCode.trim()) errors.push("Thiếu mã SP.");
  if (!line.productName.trim()) warnings.push("Thiếu tên SP hiển thị.");
  if (line.quantity <= 0) errors.push("Số lượng phải > 0.");
  if (line.unitCost <= 0) errors.push("Giá nhập phải > 0.");
  if (!line.importUnit.trim()) errors.push("Thiếu ĐV nhập.");
  if (!line.sellUnit.trim()) errors.push("Thiếu ĐV bán.");
  if (line.piecesPerUnit <= 0) errors.push("Quy đổi phải > 0.");
  if (line.discountPercent < 0 || line.discountPercent > 100) errors.push("CK 0-100%.");
  if (line.expiryMode === "date" && !line.expiryDate) warnings.push("Chưa có HSD.");
  if (line.expiryMode === "days" && line.expiryDays <= 0) errors.push("Số ngày HSD phải > 0.");

  const product = validationCatalog.find((p) => p.code.toUpperCase() === line.productCode.trim().toUpperCase());
  if (!product) {
    if (!line.category.trim()) errors.push("SP mới phải có danh mục.");
    if (!line.productName.trim()) errors.push("SP mới phải có tên.");
  } else if (line.variantCode.trim()) {
    const v = product.variants.find((x) => x.code.toUpperCase() === line.variantCode.trim().toUpperCase());
    if (v && v.importUnit && v.importUnit.trim().toUpperCase() !== line.importUnit.trim().toUpperCase()) {
      errors.push(`Variant đang dùng ${v.importUnit}/${v.piecesPerImportUnit}, Excel: ${line.importUnit}/${line.piecesPerUnit}.`);
    }
  }
  if (line.sellPrice > 0 && line.unitCost > 0 && line.sellPrice < line.unitCost) warnings.push("Giá bán < giá nhập.");
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

export default function AdminGoodsReceiptCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const draftId = params.get("draft");
  const isImportMode = params.get("mode") === "import";
  const { data: supplierRows, reload: reloadSuppliers } = useService(() => adminSuppliers.list(), []);
  const { data: categoryData, reload: reloadCategories } = useService(() => categoryService.list({ active: false }), []);
  const suppliers = supplierRows ?? [];
  const categories = categoryData?.items ?? [];
  const [lines, setLines] = useState<ReceiptLineDraft[]>(initialLines);
  const [supplier, setSupplier] = useState("");
  const [shippingFee, setShippingFee] = useState(50000);
  const [vat, setVat] = useState(10);
  const [note, setNote] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
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
  const [manualSearch, setManualSearch] = useState("");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  useEffect(() => {
    if (!isImportMode) return;
    const stage = importStaging.takeReceipt();
    if (!stage) return;
    const nextDate = stage.meta?.receiptDate || new Date().toISOString().slice(0, 10);
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
      discountPercent: line.discount,
      expiryDate: line.expiryDate || "",
      expiryDays: line.expiryDays || 0,
      expiryMode: line.expiryDays ? "days" : "date",
      note: "",
      fromImport: false,
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
  const categoryOptions = useMemo(
    () => categories.filter((c) => c.active).map((c) => ({ id: c.name, label: c.name })),
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
  const today = new Date().toISOString().slice(0, 10);
  const futureDateError = receiptDate > today;
  const missingSupplier = !supplier;
  const canSave = lines.length > 0 && !missingSupplier && !futureDateError && stats.err === 0;

  const filteredLines = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter((l) => {
      const issue = lineIssues.get(l.id) ?? { errors: [], warnings: [] };
      const status: "error" | "warning" | "ok" = issue.errors.length ? "error" : issue.warnings.length ? "warning" : "ok";
      if (filter === "error" && status !== "error") return false;
      if (filter === "warning" && status !== "warning") return false;
      if (filter === "ok" && status !== "ok") return false;
      if (filter === "edited" && !l.edited) return false;
      if (!needle) return true;
      const hay = `${l.productCode} ${l.variantCode} ${l.productName} ${l.variantName} ${l.category}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [lines, lineIssues, filter, search]);

  const syncLine = (id: string, patch: Partial<ReceiptLineDraft>) => {
    setLines((prev) => revalidateLines(prev.map((l) => {
      if (l.id !== id) return l;
      const merged: ReceiptLineDraft = { ...l, ...patch, edited: true };
      // When switching modes, keep both values intact so user can toggle back without data loss.
      // Compute a date PREVIEW from shelf-life days but only as a hint, not as the source of truth.
      return merged;
    })));
  };

  const computePreviewDate = (line: ReceiptLineDraft) => {
    if (line.expiryMode !== "days" || line.expiryDays <= 0) return "";
    const base = new Date(receiptDate);
    if (Number.isNaN(base.getTime())) return "";
    return new Date(base.getTime() + line.expiryDays * 86400000).toISOString().slice(0, 10);
  };

  const handleRevalidate = () => {
    setLines((prev) => revalidateLines(prev));
    setValidationTick((v) => v + 1);
    toast.info("Đã revalidate.");
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const addManualLine = () => {
    if (!manualSearch.trim()) return;
    const next: ReceiptLineDraft = {
      id: createLineId("manual"), sourceRow: 0, status: "warning", outcome: "create-product-and-variant",
      message: "Dòng tạo tay — cần điền đủ.", productCode: manualSearch.trim().toUpperCase().replace(/\s+/g, "-"),
      variantCode: "", productName: manualSearch.trim(), variantName: "Mặc định", category: "", newProductUnit: "",
      importUnit: "Cái", sellUnit: "Cái", piecesPerUnit: 1, quantity: 1, unitCost: 0, sellPrice: 0,
      discountPercent: 0, expiryDate: "", expiryDays: 0, expiryMode: "date", note: "", fromImport: false,
    };
    setLines((prev) => revalidateLines([...prev, next]));
    setManualSearch("");
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
    let cancel = false;
    void (async () => {
      if (!getAdminSession()?.accessToken) return;
      try {
        const pg = await productService.list({ pageSize: 500 });
        if (!cancel) {
          validationCatalog = pg.items;
          setBackendCatalog(pg.items);
          setLines((prev) => revalidateLines(prev));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const catalogProducts = useMemo(() => {
    return backendCatalog;
  }, [backendCatalog]);

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
    for (const line of lines) {
      const hit = findCatalogVariant(line);
      if (!hit) {
        toast.error(`Không map ${line.productCode} → sản phẩm backend để lưu phiếu. Hãy đồng bộ catalog (đăng nhập admin).`);
        return null;
      }
      const oid = Number(hit.variant.id);
      const pid = Number(hit.product.id);
      if (!Number.isFinite(oid) || !Number.isFinite(pid)) {
        toast.error("ID sản phẩm/variant không hợp lệ — cần catalog backend (id số).");
        return null;
      }
      out.push({
        productId: pid,
        quantity: Math.max(1, line.quantity),
        unitCost: Math.max(0, line.unitCost),
        discountPercent: Math.max(0, Math.min(100, line.discountPercent)),
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
    if (!canSave) {
      if (futureDateError) toast.error("Ngày nhập không thể ở tương lai.");
      else if (missingSupplier) toast.error("Vui lòng chọn nhà cung cấp.");
      else toast.error("Còn lỗi blocking trong danh sách hàng.");
      return;
    }

    void (async () => {
      if (!getAdminSession()?.accessToken) {
        toast.error(
          "Không có phiên admin hợp lệ — không thể lưu phiếu nhập lên máy chủ (JWT hết hạn hoặc chưa đăng nhập).",
        );
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }

      setBarcodeItems([]);

      const items = buildReceiptItems();
      if (!items) return;
      const supplierIdNum = supplier ? Number(supplier) : NaN;
      if (!Number.isFinite(supplierIdNum)) {
        toast.error("supplierId không hợp lệ — cần NCC có id số từ backend.");
        return;
      }
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      const receiptDateTime = `${receiptDate}T${t}`;

      try {
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
        toast.success(`Đã lưu phiếu nhập ${created.receiptNo} (backend).`);

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
        toast.error(e instanceof Error ? e.message : "Lưu phiếu nhập backend thất bại");
      }
    })();
  };

  const supplierName = suppliers.find((s) => s.id === supplier)?.name ?? "";

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

      {/* Top summary strip — always visible */}
      {(isImportMode || lines.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
          {importedFilename && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-info-soft px-2 py-1 text-[11px] font-medium text-info">
              <FileSpreadsheet className="h-3.5 w-3.5" /> {importedFilename}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{stats.total} dòng · {importedLineCount} từ Excel</span>
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
            <button onClick={handleRevalidate} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted">
              <RefreshCw className="h-3 w-3" /> Revalidate
            </button>
          </div>
        </div>
      )}

      {savedNumber && (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-soft p-2.5 text-xs text-success">
          <Check className="h-3.5 w-3.5" /> Đã lưu phiếu nhập <strong>{savedNumber}</strong>
          {savedReceiptId != null && <span className="text-muted-foreground">· backend #{savedReceiptId}</span>}.
        </div>
      )}

      <div className="lg:grid lg:grid-cols-3 lg:gap-3">
        <div className="space-y-3 lg:col-span-2">
          {/* Metadata */}
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Metadata phiếu nhập</h3>
              <span className="text-[10px] text-muted-foreground">NCC + Ngày là bắt buộc</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                <input type="number" value={shippingFee} onChange={(e) => setShippingFee(Number(e.target.value))} className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase text-muted-foreground">VAT (%)</label>
                <input type="number" value={vat} onChange={(e) => setVat(Number(e.target.value))} className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
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
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
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
            <div className="relative">
              <input value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManualLine()} placeholder="Thêm dòng tay..." className="h-8 w-44 rounded-md border bg-card px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <button onClick={addManualLine} disabled={!manualSearch.trim()} className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
              <Plus className="inline h-3 w-3" />
            </button>
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Excel
            </button>
          </div>

          {/* Mobile/tablet cards (≤md) */}
          <div className="space-y-2 md:hidden">
            {filteredLines.map((line, index) => {
              const issue = lineIssues.get(line.id) ?? { errors: [], warnings: [] };
              const hasError = issue.errors.length > 0;
              const hasWarning = !hasError && issue.warnings.length > 0;
              return (
                <div key={line.id} ref={(el) => (rowRefs.current[line.id] = el as any)} className={cn(
                  "rounded-lg border bg-card p-2.5 space-y-2",
                  hasError && "border-danger/40 bg-danger-soft/20",
                  hasWarning && "border-warning/40 bg-warning-soft/20",
                )}>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-muted-foreground">#{index + 1}{line.sourceRow ? `·${line.sourceRow}` : ""}</span>
                    {line.fromImport && (line.isSellable !== undefined || line.isSellableInvalid) && (
                      <span className="text-[9px] text-muted-foreground">{receiptImportRowSellableLabel({ isSellable: line.isSellable, isSellableInvalid: line.isSellableInvalid })}</span>
                    )}
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
                      line.status === "error" && "bg-danger-soft text-danger",
                      line.status === "warning" && "bg-warning-soft text-warning",
                      line.status === "ready" && "bg-success-soft text-success",
                    )}>
                      {line.status === "error" ? <AlertCircle className="h-2.5 w-2.5" /> : line.status === "warning" ? <AlertTriangle className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
                      {line.status}
                    </span>
                    <button onClick={() => removeLine(line.id)} className="ml-auto rounded p-1 text-muted-foreground hover:text-danger"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input value={line.productCode} onChange={(e) => syncLine(line.id, { productCode: e.target.value.toUpperCase() })} className={cn("h-8 rounded border bg-background px-2 text-xs font-mono", !line.productCode.trim() && "border-danger")} placeholder="Mã SP" />
                    <input value={line.variantCode} onChange={(e) => syncLine(line.id, { variantCode: e.target.value.toUpperCase() })} className="h-8 rounded border bg-background px-2 text-xs font-mono" placeholder="Mã variant" />
                    <input value={line.productName} onChange={(e) => syncLine(line.id, { productName: e.target.value })} className="col-span-2 h-8 rounded border bg-background px-2 text-xs" placeholder="Tên SP" />
                  </div>
                  <SearchableCombobox
                    value={line.category}
                    onChange={(v) => syncLine(line.id, { category: v })}
                    placeholder="Danh mục"
                    options={categoryOptions}
                    onCreateNew={(q) => {
                      const name = q.trim();
                      if (!name) return;
                      categoryService.create({ name, description: "Tạo từ phiếu nhập" })
                        .then(() => { reloadCategories(); syncLine(line.id, { category: name }); toast.success(`Đã tạo "${name}".`); })
                        .catch((err) => toast.error(err instanceof Error ? err.message : "Không thể tạo danh mục"));
                    }}
                    createLabel="Tạo danh mục mới"
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    <label className="text-[10px] text-muted-foreground">SL<input type="number" min={0} value={line.quantity} onChange={(e) => syncLine(line.id, { quantity: Math.max(0, Number(e.target.value)) })} className={cn("mt-0.5 h-8 w-full rounded border bg-background px-2 text-xs", line.quantity <= 0 && "border-danger")} /></label>
                    <label className="text-[10px] text-muted-foreground">ĐV nhập<input value={line.importUnit} onChange={(e) => syncLine(line.id, { importUnit: e.target.value })} className={cn("mt-0.5 h-8 w-full rounded border bg-background px-2 text-xs", !line.importUnit.trim() && "border-danger")} /></label>
                    <label className="text-[10px] text-muted-foreground">ĐV bán<input value={line.sellUnit} onChange={(e) => syncLine(line.id, { sellUnit: e.target.value })} className={cn("mt-0.5 h-8 w-full rounded border bg-background px-2 text-xs", !line.sellUnit.trim() && "border-danger")} /></label>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <label className="text-[10px] text-muted-foreground">Quy đổi<input type="number" min={1} value={line.piecesPerUnit} onChange={(e) => syncLine(line.id, { piecesPerUnit: Number(e.target.value) })} className={cn("mt-0.5 h-8 w-full rounded border bg-background px-2 text-xs", line.piecesPerUnit <= 0 && "border-danger")} /></label>
                    <label className="text-[10px] text-muted-foreground">Giá nhập (₫)<input type="number" min={0} value={line.unitCost} onChange={(e) => syncLine(line.id, { unitCost: Math.max(0, Number(e.target.value)) })} className={cn("mt-0.5 h-8 w-full rounded border bg-background px-2 text-right text-xs", line.unitCost <= 0 && "border-danger")} /></label>
                    <label className="text-[10px] text-muted-foreground">Giá bán (₫)<input type="number" min={0} value={line.sellPrice} onChange={(e) => syncLine(line.id, { sellPrice: Math.max(0, Number(e.target.value)) })} className="mt-0.5 h-8 w-full rounded border bg-background px-2 text-right text-xs" /></label>
                  </div>
                  <div>
                    <div className="mb-1 inline-flex rounded-md border bg-muted/40 p-0.5 text-[10px]">
                      <button type="button" onClick={() => syncLine(line.id, { expiryMode: "date" })} className={cn("rounded px-2 py-0.5", line.expiryMode === "date" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>Ngày HSD</button>
                      <button type="button" onClick={() => syncLine(line.id, { expiryMode: "days" })} className={cn("rounded px-2 py-0.5", line.expiryMode === "days" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>Số ngày SD</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <DateInput allowFuture value={line.expiryDate} onChange={(v) => syncLine(line.id, { expiryDate: v, expiryMode: "date" })} className={cn("h-8 w-full text-xs", line.expiryMode === "date" ? "ring-1 ring-ring/40" : "opacity-70")} />
                      <input type="number" min={0} value={line.expiryDays} onChange={(e) => syncLine(line.id, { expiryDays: Math.max(0, Number(e.target.value)), expiryMode: "days" })} className={cn("h-8 w-full rounded border bg-card px-2 text-center text-xs", line.expiryMode === "days" && line.expiryDays <= 0 && "border-danger", line.expiryMode === "days" ? "ring-1 ring-ring/40" : "opacity-70")} placeholder="Số ngày" />
                    </div>
                    {line.expiryMode === "days" && line.expiryDays > 0 && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">≈ HSD: {computePreviewDate(line) || "—"}</div>
                    )}
                  </div>
                  {(issue.errors.length > 0 || issue.warnings.length > 0) && (
                    <div className="space-y-0.5 rounded-md bg-muted/30 px-2 py-1.5 text-[11px]">
                      {issue.errors.map((m, i) => <div key={`e-${i}`} className="flex items-center gap-1 text-danger"><AlertCircle className="h-3 w-3" /> {m}</div>)}
                      {issue.warnings.map((m, i) => <div key={`w-${i}`} className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> {m}</div>)}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredLines.length === 0 && (
              <div className="rounded-lg border bg-card py-8 text-center text-sm text-muted-foreground">
                {lines.length === 0 ? "Chưa có dòng nhập nào." : "Không có dòng khớp bộ lọc."}
              </div>
            )}
          </div>

          {/* Lines table — desktop only */}
          <div className="hidden md:block overflow-x-auto rounded-lg border bg-card">
            <table className="min-w-[1500px] w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b text-[10px] uppercase text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium w-10">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">Mã / tên SP</th>
                  <th className="px-2 py-1.5 text-left font-medium">Variant</th>
                  <th className="px-2 py-1.5 text-left font-medium">Danh mục / ĐV SP mới</th>
                  <th className="px-2 py-1.5 text-center font-medium">SL</th>
                  <th className="px-2 py-1.5 text-center font-medium">ĐV nhập / bán / quy đổi</th>
                  <th className="px-2 py-1.5 text-right font-medium">Giá nhập / bán (₫)</th>
                  <th className="px-2 py-1.5 text-center font-medium">CK%</th>
                  <th className="px-2 py-1.5 text-center font-medium w-64">HSD (Ngày · Số ngày)</th>
                  <th className="px-2 py-1.5 text-left font-medium w-56">Trạng thái</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line, index) => {
                  const issue = lineIssues.get(line.id) ?? { errors: [], warnings: [] };
                  const hasError = issue.errors.length > 0;
                  const hasWarning = !hasError && issue.warnings.length > 0;
                  const productExists = validationCatalog.some((p) => p.code.toUpperCase() === line.productCode.toUpperCase());
                  return (
                    <tr
                      key={line.id}
                      ref={(el) => (rowRefs.current[line.id] = el)}
                      className={cn(
                        "border-b last:border-0 align-top",
                        hasError && "bg-danger-soft/30",
                        hasWarning && "bg-warning-soft/20",
                        line.edited && !hasError && !hasWarning && "bg-info-soft/20",
                      )}
                    >
                      <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                        {index + 1}
                        {line.sourceRow > 0 && <div className="text-[9px]">#{line.sourceRow}</div>}
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={line.productCode} onChange={(e) => syncLine(line.id, { productCode: e.target.value.toUpperCase() })} className={cn("mb-1 h-7 w-full rounded border bg-background px-2 text-[11px] font-mono", !line.productCode.trim() && "border-danger")} placeholder="Mã SP" />
                        <input value={line.productName} onChange={(e) => syncLine(line.id, { productName: e.target.value })} className="h-7 w-full rounded border bg-background px-2 text-[11px]" placeholder="Tên SP" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={line.variantCode} onChange={(e) => syncLine(line.id, { variantCode: e.target.value.toUpperCase() })} className="mb-1 h-7 w-full rounded border bg-background px-2 text-[11px] font-mono" placeholder="Mã variant" />
                        <input value={line.variantName} onChange={(e) => syncLine(line.id, { variantName: e.target.value })} className="h-7 w-full rounded border bg-background px-2 text-[11px]" placeholder="Tên variant" />
                      </td>
                      <td className="px-2 py-1.5">
                        <SearchableCombobox
                          className="mb-1"
                          value={line.category}
                          onChange={(v) => syncLine(line.id, { category: v })}
                          invalid={!productExists && !line.category.trim()}
                          placeholder="Danh mục"
                          options={categoryOptions}
                          onCreateNew={(q) => {
                            const name = q.trim();
                            if (!name) return;
                            categoryService.create({ name, description: "Tạo từ phiếu nhập" })
                              .then(() => { reloadCategories(); syncLine(line.id, { category: name }); toast.success(`Đã tạo danh mục "${name}".`); })
                              .catch((err) => toast.error(err instanceof Error ? err.message : "Không thể tạo danh mục"));
                          }}
                          createLabel="Tạo danh mục mới"
                        />
                        <input value={line.newProductUnit} onChange={(e) => syncLine(line.id, { newProductUnit: e.target.value })} className="h-7 w-full rounded border bg-background px-2 text-[11px]" placeholder="ĐV SP mới" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="number" value={line.quantity} onChange={(e) => syncLine(line.id, { quantity: Number(e.target.value) })} className={cn("h-7 w-16 rounded border bg-background px-2 text-center text-[11px]", line.quantity <= 0 && "border-danger")} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="grid grid-cols-3 gap-1">
                          <input value={line.importUnit} onChange={(e) => syncLine(line.id, { importUnit: e.target.value })} className={cn("h-7 rounded border bg-background px-2 text-[11px]", !line.importUnit.trim() && "border-danger")} placeholder="Nhập" />
                          <input value={line.sellUnit} onChange={(e) => syncLine(line.id, { sellUnit: e.target.value })} className={cn("h-7 rounded border bg-background px-2 text-[11px]", !line.sellUnit.trim() && "border-danger")} placeholder="Bán" />
                          <input type="number" value={line.piecesPerUnit} onChange={(e) => syncLine(line.id, { piecesPerUnit: Number(e.target.value) })} className={cn("h-7 rounded border bg-background px-2 text-center text-[11px]", line.piecesPerUnit <= 0 && "border-danger")} placeholder="Quy đổi" />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="grid grid-cols-2 gap-1">
                          <div className="relative">
                            <input type="number" min={0} step={1000} value={line.unitCost} onChange={(e) => syncLine(line.id, { unitCost: Math.max(0, Number(e.target.value)) })} className={cn("h-7 w-full rounded border bg-background pl-2 pr-6 text-right text-[11px]", line.unitCost <= 0 && "border-danger")} placeholder="Nhập" />
                            <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">₫</span>
                          </div>
                          <div className="relative">
                            <input type="number" min={0} step={1000} value={line.sellPrice} onChange={(e) => syncLine(line.id, { sellPrice: Math.max(0, Number(e.target.value)) })} className="h-7 w-full rounded border bg-background pl-2 pr-6 text-right text-[11px]" placeholder="Bán" />
                            <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">₫</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="number" min={0} max={100} value={line.discountPercent} onChange={(e) => syncLine(line.id, { discountPercent: Number(e.target.value) })} className={cn("h-7 w-14 rounded border bg-background px-2 text-center text-[11px]", (line.discountPercent < 0 || line.discountPercent > 100) && "border-danger")} />
                      </td>
                      <td className="px-2 py-1.5">
                        {/* Two ALWAYS-VISIBLE inputs preserving the original Excel meaning */}
                        <div className="space-y-1">
                          <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-[10px]">
                            <button type="button" onClick={() => syncLine(line.id, { expiryMode: "date" })} className={cn("rounded px-1.5 py-0.5", line.expiryMode === "date" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>Ngày HSD</button>
                            <button type="button" onClick={() => syncLine(line.id, { expiryMode: "days" })} className={cn("rounded px-1.5 py-0.5", line.expiryMode === "days" ? "bg-card font-semibold shadow-sm" : "text-muted-foreground")}>Số ngày</button>
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            <div>
                              <DateInput allowFuture value={line.expiryDate} onChange={(v) => syncLine(line.id, { expiryDate: v, expiryMode: "date" })} className={cn("h-7 w-full", line.expiryMode === "date" ? "ring-1 ring-ring/40" : "opacity-70")} />
                              <div className="text-[9px] text-muted-foreground">Ngày HSD</div>
                            </div>
                            <div>
                              <input type="number" min={0} value={line.expiryDays} onChange={(e) => syncLine(line.id, { expiryDays: Math.max(0, Number(e.target.value)), expiryMode: "days" })} className={cn("h-7 w-full rounded border bg-card px-2 text-center text-[11px]", line.expiryMode === "days" && line.expiryDays <= 0 && "border-danger", line.expiryMode === "days" ? "ring-1 ring-ring/40" : "opacity-70")} placeholder="ngày" />
                              <div className="text-[9px] text-muted-foreground">Số ngày SD</div>
                            </div>
                          </div>
                          {line.expiryMode === "days" && line.expiryDays > 0 && (
                            <div className="text-[10px] text-muted-foreground">≈ HSD: {computePreviewDate(line) || "—"}</div>
                          )}
                        </div>
                        <input value={line.note} onChange={(e) => syncLine(line.id, { note: e.target.value })} className="mt-1 h-6 w-full rounded border bg-background px-2 text-[10px]" placeholder="Ghi chú" />
                      </td>
                      <td className="px-2 py-1.5 text-[10px]">
                        <div className="space-y-0.5">
                          {line.fromImport && (line.isSellable !== undefined || line.isSellableInvalid) && (
                            <div className="text-[9px] text-muted-foreground">
                              {receiptImportRowSellableLabel({ isSellable: line.isSellable, isSellableInvalid: line.isSellableInvalid })}
                            </div>
                          )}
                          <div className={cn(
                            "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
                            line.status === "error" && "bg-danger-soft text-danger",
                            line.status === "warning" && "bg-warning-soft text-warning",
                            line.status === "ready" && "bg-success-soft text-success",
                          )}>
                            {line.status === "error" ? <AlertCircle className="h-2.5 w-2.5" /> : line.status === "warning" ? <AlertTriangle className="h-2.5 w-2.5" /> : <Check className="h-2.5 w-2.5" />}
                            {line.outcome}
                          </div>
                          {issue.errors.map((m, i) => <div key={`e-${i}`} className="flex items-start gap-1 text-danger"><AlertCircle className="mt-0.5 h-2.5 w-2.5 shrink-0" /> <span>{m}</span></div>)}
                          {issue.warnings.map((m, i) => <div key={`w-${i}`} className="flex items-start gap-1 text-warning"><AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" /> <span>{m}</span></div>)}
                        </div>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button onClick={() => removeLine(line.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"><Trash2 className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredLines.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                {lines.length === 0 ? "Chưa có dòng nhập nào." : "Không có dòng khớp bộ lọc."}
              </div>
            )}
          </div>
        </div>

        {/* Sticky summary */}
        <div className="mt-3 lg:mt-0">
          <div className="space-y-3 rounded-lg border bg-card p-3 lg:sticky lg:top-20">
            <h3 className="text-sm font-semibold">Tổng kết & hành động</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Dòng hàng</span><span>{lines.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Từ Excel</span><span>{importedLineCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tạm tính</span><span>{formatVND(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phí ship</span><span>{formatVND(shippingFee)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">VAT ({vat}%)</span><span>{formatVND(vatAmount)}</span></div>
              <div className="flex justify-between border-t pt-1.5 text-sm font-bold"><span>Tổng</span><span className="text-primary">{formatVND(total)}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <button onClick={() => setFilter("ok")} className="rounded-md bg-success-soft p-1.5 text-success hover:bg-success/10"><strong>{stats.ok}</strong> OK</button>
              <button onClick={() => jumpToFirst("warning")} className="rounded-md bg-warning-soft p-1.5 text-warning hover:bg-warning/10"><strong>{stats.warn}</strong> Warn</button>
              <button onClick={() => jumpToFirst("error")} className="rounded-md bg-danger-soft p-1.5 text-danger hover:bg-danger/10"><strong>{stats.err}</strong> Error</button>
            </div>
            {!canSave && lines.length > 0 && (
              <div className="rounded-md bg-muted p-2 text-[10px] text-muted-foreground">
                {missingSupplier && <div>• Chưa chọn NCC</div>}
                {futureDateError && <div>• Ngày nhập tương lai</div>}
                {stats.err > 0 && <div>• Còn {stats.err} dòng lỗi</div>}
              </div>
            )}
            {!savedNumber ? (
              <div className="space-y-1.5">
                <button onClick={handleSave} disabled={!canSave} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" /> Lưu phiếu nhập
                </button>
                <button onClick={handleSaveDraft} className="flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium hover:bg-muted">
                  <FileText className="h-3.5 w-3.5" /> {currentDraftId ? "Cập nhật nháp" : "Lưu nháp"}
                </button>
                <button onClick={handleRevalidate} className="flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium hover:bg-muted">
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
