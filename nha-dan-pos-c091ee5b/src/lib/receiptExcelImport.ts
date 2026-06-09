import * as XLSX from "xlsx";
import { defaultSellableTrue, parseImportSellableCell, type SellableParseResult } from "@/lib/importSellableParse";

/** Parsed row from goods receipt "SP Don" template (new format: cột P = isSellable). */
export interface ReceiptExcelRow {
  lineNumber: number;
  productCode: string;
  variantCode: string;
  productName: string;
  quantity: number | null;
  unitCost: number | null;
  sellPrice: number | null;
  discountPercent: number | null;
  note: string;
  category: string;
  unit: string;
  importUnit: string;
  sellUnit: string;
  pieces: number | null;
  expiryDateOverride: string | null;
  expiryDays: number | null;
  /** Cột P — default true. */
  isSellable: boolean;
  isSellableExplicit: boolean;
  isSellableInvalid: boolean;
  rawIsSellableCell: string | null;
  /**
   * Parse-time warnings (no product lookup). Confirms with BE rules for missing variantCode
   * for NVL, and generic multi-variant / new-variant risk when not known from Excel alone.
   */
  importWarnings: string[];
}

const COL_IS_SELLABLE = 15; // P

/**
 * Warnings for blank variantCode, aligned with backend import semantics (default-variant
 * fallback is risky for NVL and when multiple variants or new variant creation apply).
 * Product multi-variant and “new variant” cases are flagged generically; exact checks need BE/lookup.
 */
export function buildReceiptImportVariantWarnings(
  variantCode: string,
  isSellable: boolean
): string[] {
  const w: string[] = [];
  if (String(variantCode).trim() !== "") return w;
  if (!isSellable) {
    w.push(
      "NVL / không bán lẻ + thiếu mã quy cách — dễ nhập nhầm biến thể; nên bổ sung mã trước khi tạo phiếu."
    );
  } else {
    w.push(
      "Thiếu mã quy cách: nếu sản phẩm có nhiều biến thể hoặc dòng tạo biến thể mới, cần nhập mã (BE có thể gán biến thể mặc định)."
    );
  }
  return w;
}

function cellStr(row: unknown[], col: number): string | null {
  const v = row[col];
  if (v == null || v === "") return null;
  return String(v).trim();
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read first "SP Don" or first sheet; expects new format with optional column P.
 */
export function readReceiptExcelTemplate(file: File): Promise<ReceiptExcelRow[]> {
  return file.arrayBuffer().then((buf) => {
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const name =
      wb.SheetNames.find((n) => {
        const t = n.toLowerCase().replace(/\s/g, "");
        return t.includes("spdon") || t.includes("don") || t.includes("sanpham");
      }) ?? wb.SheetNames[0];
    const sh = name ? wb.Sheets[name] : undefined;
    if (!sh) return [];
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null }) as unknown[][];
    const start = 3;
    const out: ReceiptExcelRow[] = [];
    for (let i = start; i < aoa.length; i++) {
      const row = aoa[i] as unknown[];
      if (!row || !row.length) continue;
      const productCode = cellStr(row, 0);
      if (productCode == null) continue;
      const isSellableRaw = cellStr(row, COL_IS_SELLABLE);
      const sp: SellableParseResult = parseImportSellableCell(isSellableRaw);
      const vCode = cellStr(row, 1) ?? "";
      const sellable = defaultSellableTrue(sp.value);
      out.push({
        lineNumber: i + 1,
        productCode: productCode.toUpperCase(),
        variantCode: vCode,
        productName: cellStr(row, 2) ?? "",
        quantity: toNum(row[3]),
        unitCost: toNum(row[4]),
        sellPrice: toNum(row[5]),
        discountPercent: toNum(row[6]),
        note: cellStr(row, 7) ?? "",
        category: cellStr(row, 8) ?? "",
        unit: cellStr(row, 9) ?? "",
        importUnit: cellStr(row, 10) ?? "",
        sellUnit: cellStr(row, 11) ?? "",
        pieces: toNum(row[12]) != null ? Math.trunc(toNum(row[12])!) : null,
        expiryDateOverride: cellStr(row, 13),
        expiryDays: toNum(row[14]) != null ? Math.trunc(toNum(row[14])!) : null,
        isSellable: sellable,
        isSellableExplicit: sp.explicit,
        isSellableInvalid: sp.invalid,
        rawIsSellableCell: isSellableRaw,
        importWarnings: buildReceiptImportVariantWarnings(vCode, sellable),
      });
    }
    return out;
  });
}

export function receiptImportPreviewLabel(row: ReceiptExcelRow): string {
  const base = row.isSellableInvalid
    ? "Bán hàng? (cột lỗi)"
    : !row.isSellable
      ? "NVL / ẩn bán lẻ"
      : "Bán lẻ";
  if (row.importWarnings.length > 0) {
    return `${base} · ⚠ quy cách`;
  }
  return base;
}
