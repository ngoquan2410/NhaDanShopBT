import { describe, expect, it } from "vitest";
import { File as NodeFile } from "node:buffer";
import * as XLSX from "xlsx";
import { parseProductExcel, parseReceiptExcel } from "@/lib/excel-parser";
import { importStaging } from "@/lib/import-staging";

/** `node:buffer` File is not assignable to DOM `File` in typings; cast is safe for `arrayBuffer()` usage. */
function toXlsxFile(buf: Uint8Array, name: string): File {
  return new NodeFile([buf], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }) as unknown as File;
}

function productWorkbook(colN: string | undefined): File {
  const pad = (): unknown[] => {
    const r = Array(14).fill(null);
    r[0] = ".";
    return r;
  };
  const r: unknown[] = Array(14).fill(null);
  r[0] = "BT-RAW";
  r[1] = "Bánh tráng nguyên liệu";
  r[2] = "Nguyên liệu";
  r[3] = 50000;
  r[4] = 0;
  r[5] = 0;
  r[6] = 30;
  r[8] = "kg";
  r[9] = "g";
  r[10] = 1000;
  r[11] = "";
  r[12] = 100;
  if (colN !== undefined) {
    r[13] = colN;
  }
  const aoa: unknown[][] = [pad(), pad(), pad(), r];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return toXlsxFile(new Uint8Array(buf), "product-s5.xlsx");
}

function receiptWorkbook(opts: {
  variantCode: string;
  colP: string | undefined;
}): File {
  const pad = (): unknown[] => {
    const r = Array(16).fill(null);
    r[0] = ".";
    return r;
  };
  const r: unknown[] = Array(16).fill(null);
  r[0] = "BT-RAW";
  r[1] = opts.variantCode;
  r[2] = "Bánh tráng nguyên liệu";
  r[3] = 1;
  r[4] = 50000;
  r[5] = 0;
  r[6] = 0;
  r[7] = "";
  r[8] = "Nguyên liệu";
  r[9] = "g";
  r[10] = "kg";
  r[11] = "g";
  r[12] = 1000;
  r[14] = 30;
  if (opts.colP !== undefined) {
    r[15] = opts.colP;
  }
  const aoa: unknown[][] = [pad(), pad(), pad(), r];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "SP Don");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return toXlsxFile(new Uint8Array(buf), "receipt-s5.xlsx");
}

describe("Slice 5 excel-parser facade (real .xlsx in memory)", () => {
  it("sanity: in-memory .xlsx round-trips to row 4 (index 3) for parsers", async () => {
    const file = productWorkbook("x");
    const ab = await file.arrayBuffer();
    expect(ab.byteLength).toBeGreaterThan(80);
    const wb = XLSX.read(new Uint8Array(ab), { type: "array" });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]!, {
      header: 1,
      defval: null,
    }) as unknown[][];
    expect(aoa.length).toBe(4);
    expect((aoa[3] as unknown[])[0]).toBe("BT-RAW");
  });

  it("parseProductExcel: column N false token → isSellable false, explicit, not invalid", async () => {
    const file = productWorkbook("nguyên liệu");
    const rows = await parseProductExcel(file);
    const row = rows.find((r) => r.code === "BT-RAW");
    expect(row).toBeDefined();
    expect(row!.isSellable).toBe(false);
    expect(row!.isSellableExplicit).toBe(true);
    expect(row!.isSellableInvalid).toBe(false);
  });

  it("parseProductExcel: missing column N → defaults isSellable true", async () => {
    const file = productWorkbook(undefined);
    const rows = await parseProductExcel(file);
    const row = rows.find((r) => r.code === "BT-RAW");
    expect(row!.isSellable).toBe(true);
    expect(row!.isSellableInvalid).toBeFalsy();
  });

  it("parseProductExcel: variantCode/name inherit product columns (single-variant template)", async () => {
    const file = productWorkbook(undefined);
    const rows = await parseProductExcel(file);
    const row = rows.find((r) => r.code === "BT-RAW");
    expect(row).toBeDefined();
    expect(row!.variantCode).toBe("BT-RAW");
    expect(row!.variantName).toBe("Bánh tráng nguyên liệu");
  });

  it("parseProductExcel: empty product code yields empty variantCode, variantName still matches name", async () => {
    const pad = (): unknown[] => {
      const r = Array(14).fill(null);
      r[0] = ".";
      return r;
    };
    const r: unknown[] = Array(14).fill(null);
    r[0] = "";
    r[1] = "Chưa có mã SP";
    r[2] = "Nguyên liệu";
    r[3] = 50000;
    r[4] = 10000;
    r[5] = 0;
    r[6] = 30;
    r[8] = "kg";
    r[9] = "g";
    r[10] = 1000;
    r[11] = "";
    r[12] = 100;
    const aoa: unknown[][] = [pad(), pad(), pad(), r];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const file = toXlsxFile(new Uint8Array(buf), "product-no-code.xlsx");
    const rows = await parseProductExcel(file);
    const row = rows.find((x) => x.name === "Chưa có mã SP");
    expect(row).toBeDefined();
    expect(row!.code).toBe("");
    expect(row!.variantCode).toBe("");
    expect(row!.variantName).toBe("Chưa có mã SP");
  });

  it("parseProductExcel: invalid N → error status and invalid flag", async () => {
    const file = productWorkbook("___not_a_token___");
    const rows = await parseProductExcel(file);
    const row = rows.find((r) => r.code === "BT-RAW");
    expect(row!.status).toBe("error");
    expect(row!.isSellableInvalid).toBe(true);
  });

  it("parseReceiptExcel: column P false token → mapped row fields", async () => {
    const file = receiptWorkbook({ variantCode: "BT-RAW-G", colP: "raw" });
    const rows = await parseReceiptExcel(file);
    const row = rows.find((r) => r.productCode === "BT-RAW");
    expect(row).toBeDefined();
    expect(row!.isSellable).toBe(false);
    expect(row!.isSellableExplicit).toBe(true);
    expect(row!.isSellableInvalid).toBe(false);
    expect(row!.sellPrice).toBe(0);
  });

  it("parseReceiptExcel: blank P → default sellable true", async () => {
    const file = receiptWorkbook({ variantCode: "BT-RAW-G", colP: undefined });
    const rows = await parseReceiptExcel(file);
    const row = rows.find((r) => r.productCode === "BT-RAW");
    expect(row!.isSellable).toBe(true);
    expect(row!.isSellableExplicit).toBe(false);
  });

  it("parseReceiptExcel: invalid P → invalid flag", async () => {
    const file = receiptWorkbook({ variantCode: "BT-RAW-G", colP: "not_valid_token_zzz" });
    const rows = await parseReceiptExcel(file);
    const row = rows.find((r) => r.productCode === "BT-RAW");
    expect(row!.isSellableInvalid).toBe(true);
    expect(row!.status).toBe("error");
  });

  it("parseReceiptExcel: blank variant + NVL → warning / status warning", async () => {
    const file = receiptWorkbook({ variantCode: "", colP: "không" });
    const rows = await parseReceiptExcel(file);
    const row = rows.find((r) => r.productCode === "BT-RAW");
    expect(row!.importWarnings?.length).toBeGreaterThan(0);
    expect(row!.status).toBe("warning");
  });

  it("importStaging preserves isSellable from parseProductExcel", async () => {
    const file = productWorkbook("raw");
    const rows = await parseProductExcel(file);
    importStaging.setProducts({ filename: "x.xlsx", rows, createdAt: 1 });
    const st = importStaging.takeProducts();
    expect(st).not.toBeNull();
    expect(st!.rows.some((r) => r.isSellable === false)).toBe(true);
  });

  /** Mirrors ProductImportReview saleable-aware pricing (NVL allows zero when isSellable===false). */
  function saleablePriceIssues(isSellable: boolean | undefined, sellPrice: number, costPrice: number) {
    const saleable = isSellable !== false;
    const errors: string[] = [];
    if (!Number.isFinite(sellPrice)) errors.push("sell");
    else if (sellPrice < 0) errors.push("sellNeg");
    else if (saleable && sellPrice === 0) errors.push("sellZero");
    if (!Number.isFinite(costPrice)) errors.push("cost");
    else if (costPrice < 0) errors.push("costNeg");
    else if (saleable && costPrice === 0) errors.push("costZero");
    return errors;
  }

  it("saleable-aware pricing: saleable blocks zero prices", () => {
    expect(saleablePriceIssues(true, 0, 100)).toContain("sellZero");
    expect(saleablePriceIssues(undefined, 10, 0)).toContain("costZero");
  });

  it("saleable-aware pricing: NVL allows zero catalog prices", () => {
    expect(saleablePriceIssues(false, 0, 0)).toEqual([]);
  });
});
