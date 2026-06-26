import { describe, expect, it } from "vitest";
import {
  buildReceiptIdentityInvalidToast,
  buildReceiptIdentityMissingToast,
  buildReceiptLineLabel,
} from "@/pages/admin/GoodsReceiptCreate";

describe("GoodsReceipt identity toast messages", () => {
  describe("buildReceiptLineLabel", () => {
    it("joins productCode / variantCode and appends 1-based index", () => {
      expect(
        buildReceiptLineLabel({ productCode: "P01", variantCode: "V01" }, 0),
      ).toBe("P01 / V01 (#1)");
    });

    it("falls back to productName when codes are blank", () => {
      expect(
        buildReceiptLineLabel({ productCode: "  ", variantCode: "", productName: "Sữa tươi" }, 2),
      ).toBe("Sữa tươi (#3)");
    });

    it("falls back to #index when no identifier present", () => {
      expect(buildReceiptLineLabel({}, 4)).toBe("#5 (#5)");
    });
  });

  describe("buildReceiptIdentityMissingToast", () => {
    it("includes line label and unknown ids when no fallback provided", () => {
      const msg = buildReceiptIdentityMissingToast(
        { productCode: "P01", variantCode: "V01" },
        0,
        null,
      );
      expect(msg).toContain("P01 / V01 (#1)");
      expect(msg).toContain("productId=?");
      expect(msg).toContain("variantId=?");
      expect(msg).toContain("Không xác định được sản phẩm/biến thể");
    });

    it("includes numeric productId/variantId when fallback resolves them", () => {
      const msg = buildReceiptIdentityMissingToast(
        { productCode: "P02" },
        1,
        { productId: 42, variantId: 99 },
      );
      expect(msg).toContain("productId=42");
      expect(msg).toContain("variantId=99");
      expect(msg).toContain("P02 (#2)");
    });

    it("explains create-product-and-variant case with actionable hint", () => {
      const msg = buildReceiptIdentityMissingToast(
        { productCode: "NEWSP", outcome: "create-product-and-variant" },
        0,
        null,
      );
      expect(msg).toContain("SP MỚI");
      expect(msg).toContain("Quản trị → Sản phẩm");
      expect(msg).not.toContain("chọn lại biến thể");
    });

    it("explains create-variant case with actionable hint", () => {
      const msg = buildReceiptIdentityMissingToast(
        { productCode: "P10", variantCode: "NEWV", outcome: "create-variant" },
        2,
        null,
      );
      expect(msg).toContain("VARIANT MỚI");
      expect(msg).toContain("trang Sản phẩm");
    });
  });

  describe("buildReceiptIdentityInvalidToast", () => {
    it("renders NaN/undefined identity values in the toast message", () => {
      const msg = buildReceiptIdentityInvalidToast(
        { productCode: "P03", variantCode: "V03" },
        2,
        { productId: Number.NaN, variantId: undefined },
      );
      expect(msg).toContain("P03 / V03 (#3)");
      expect(msg).toContain("productId=NaN");
      expect(msg).toContain("variantId=undefined");
      expect(msg).toContain("ID sản phẩm/variant không hợp lệ");
    });

    it("renders finite ids as strings (useful for debugging mixed types)", () => {
      const msg = buildReceiptIdentityInvalidToast(
        { productName: "SP X" },
        0,
        { productId: 7, variantId: "abc" },
      );
      expect(msg).toContain("SP X (#1)");
      expect(msg).toContain("productId=7");
      expect(msg).toContain("variantId=abc");
    });
  });
});

