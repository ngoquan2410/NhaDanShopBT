import * as XLSX from "xlsx";
import { defaultSellableTrue, parseImportSellableCell, type SellableParseResult } from "@/lib/importSellableParse";

/** One parsed row from product import template (aligns with backend column layout). */
export interface ProductExcelRow {
  lineNumber: number;
  code: string;
  name: string;
  categoryName: string;
  costPrice: number | null;
  sellPrice: number | null;
  stockQty: number | null;
  expiryDays: number | null;
  active: boolean | null;
  importUnit: string;
  sellUnit: string;
  piecesPerUnit: number | null;
  conversionNote: string;
  minStockQty: number | null;
  /** Cột N optional — default true if missing. */
  isSellable: boolean;
  isSellableExplicit: boolean;
  isSellableInvalid: boolean;
  rawIsSellableCell: string | null;
}

const COL_IS_SELLABLE = 13; // N

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
 * Read sheet 0, row 4+ (0-based index 3+) like backend — optional column N = isSellable.
 */
export function readProductExcelTemplate(file: File): Promise<ProductExcelRow[]> {
  return file.arrayBuffer().then((buf) => {
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
    const start = 3;
    const out: ProductExcelRow[] = [];
    for (let i = start; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || !row.length) continue;
      const r = row as unknown[];
      const name = cellStr(r, 1);
      if (name == null) continue;
      const sellP = toNum(r[4]);
      const isSellableRaw = cellStr(r, COL_IS_SELLABLE);
      const sp: SellableParseResult = parseImportSellableCell(isSellableRaw);
      out.push({
        lineNumber: i + 1,
        code: cellStr(r, 0) ?? "",
        name,
        categoryName: cellStr(r, 2) ?? "",
        costPrice: toNum(r[3]),
        sellPrice: sellP,
        stockQty: toNum(r[5]) != null ? Math.trunc(toNum(r[5])!) : null,
        expiryDays: toNum(r[6]) != null ? Math.trunc(toNum(r[6])!) : null,
        active: null,
        importUnit: cellStr(r, 8) ?? "",
        sellUnit: cellStr(r, 9) ?? "",
        piecesPerUnit: toNum(r[10]) != null ? Math.trunc(toNum(r[10])!) : null,
        conversionNote: cellStr(r, 11) ?? "",
        minStockQty: toNum(r[12]) != null ? Math.trunc(toNum(r[12])!) : null,
        isSellable: defaultSellableTrue(sp.value),
        isSellableExplicit: sp.explicit,
        isSellableInvalid: sp.invalid,
        rawIsSellableCell: isSellableRaw,
      });
    }
    return out;
  });
}

export function productImportPreviewLabel(row: ProductExcelRow): string {
  if (row.isSellableInvalid) return "Không bán? (cột lỗi)";
  if (!row.isSellable) return "NVL / không bán lẻ";
  return "Bán lẻ";
}
