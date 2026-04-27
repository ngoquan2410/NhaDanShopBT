import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export interface BarcodeProps {
  value: string;
  format?: "CODE128" | "EAN13" | "EAN8" | "UPC" | "CODE39" | "ITF14";
  width?: number;       // bar width in px (module width)
  height?: number;      // bar height in px
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;      // quiet zone (px)
  background?: string;
  lineColor?: string;
  className?: string;
}

/**
 * Real, scanner-readable barcode using JsBarcode → SVG.
 * SVG scales cleanly for both screen preview and print.
 * Default format: CODE128 (handles alphanumeric codes like SP001-01, BTMIHAOHAO01).
 */
export function Barcode({
  value,
  format = "CODE128",
  width = 1.6,
  height = 56,
  displayValue = true,
  fontSize = 12,
  margin = 6,
  background = "#ffffff",
  lineColor = "#000000",
  className,
}: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);
  const safeValue = (value || "").trim();

  useEffect(() => {
    if (!ref.current) return;
    if (!safeValue) return;
    try {
      JsBarcode(ref.current, safeValue, {
        format,
        width,
        height,
        displayValue,
        fontSize,
        margin,
        background,
        lineColor,
        textMargin: 2,
        font: "monospace",
      });
    } catch (e) {
      // JsBarcode throws for invalid values — caller renders error state below.
      console.warn("Barcode render failed:", safeValue, e);
    }
  }, [safeValue, format, width, height, displayValue, fontSize, margin, background, lineColor]);

  if (!safeValue) {
    return (
      <div
        className={className}
        style={{
          fontSize: 10,
          color: "#b91c1c",
          border: "1px dashed #b91c1c",
          padding: 4,
          textAlign: "center",
          background: "#fff",
        }}
      >
        Mã trống – không thể tạo barcode
      </div>
    );
  }

  return <svg ref={ref} className={className} />;
}
