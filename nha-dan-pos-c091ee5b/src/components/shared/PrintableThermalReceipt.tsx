import type { GoodsReceipt, GoodsReceiptLine } from "@/services/types";
import { formatVND, formatDate } from "@/lib/format";
import type { ThermalPaperMode } from "@/components/shared/PrintableThermalInvoice";

interface Props {
  receipt: GoodsReceipt;
  lines: GoodsReceiptLine[];
  paper: ThermalPaperMode;
  rootId?: string;
}

const THERMAL_FONT = "Arial, Helvetica, system-ui, sans-serif";

export function PrintableThermalReceipt({ receipt, lines, paper, rootId }: Props) {
  const is58 = paper === "pos58";
  const paperWidth = is58 ? 58 : 80;
  const innerWidth = is58 ? "41mm" : "70mm";
  const sidePad = is58 ? "1.5mm" : "1mm";
  const baseFont = is58 ? 10 : 11;
  const metaFont = is58 ? 10 : 11;
  const moneyFont = is58 ? 10.5 : 11.5;
  const totalFont = is58 ? 12 : 14;
  const titleFont = is58 ? 12 : 14;
  const shopFont = is58 ? 13 : 15;
  const amountColWidth = is58 ? "21mm" : "30mm";
  const metaColWidth = is58 ? "26mm" : "40mm";

  const subtotal = lines.reduce(
    (s, l) => s + (l.afterDiscount ?? l.quantity * l.unitCost * (1 - l.discountPercent / 100)),
    0,
  );
  const total = subtotal + receipt.shippingFee + receipt.vat;

  const Row = (props: {
    label: string;
    value: string;
    rightWidth?: string;
    strong?: boolean;
    fontSize?: number;
  }) => (
    <div
      style={{
        display: "table",
        width: "100%",
        tableLayout: "fixed",
        fontWeight: props.strong ? 700 : 500,
        fontSize: `${props.fontSize ?? baseFont}px`,
        color: "#000",
      }}
    >
      <div style={{ display: "table-row" }}>
        <div
          style={{
            display: "table-cell",
            verticalAlign: "top",
            wordBreak: "break-word",
            paddingRight: "1mm",
            color: "#000",
          }}
        >
          {props.label}
        </div>
        <div
          style={{
            display: "table-cell",
            verticalAlign: "top",
            width: props.rightWidth ?? amountColWidth,
            textAlign: "right",
            wordBreak: "break-word",
            color: "#000",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {props.value}
        </div>
      </div>
    </div>
  );

  const divider = <div style={{ borderTop: "1px dashed #000", margin: "3px 0" }} />;
  const solidDivider = <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />;

  return (
    <div
      id={rootId ?? `print-root-receipt-${paper}`}
      className="print-root"
      data-print-root="goods-receipt"
      data-print-mode={paper}
      data-paper-width-mm={paperWidth}
    >
      <div
        data-thermal-root
        style={{
          width: innerWidth,
          maxWidth: innerWidth,
          paddingLeft: sidePad,
          paddingRight: sidePad,
          paddingTop: "2mm",
          paddingBottom: "2mm",
          margin: 0,
          background: "#fff",
          color: "#000",
          fontFamily: THERMAL_FONT,
          fontSize: `${baseFont}px`,
          lineHeight: 1.3,
          fontWeight: 500,
        }}
      >
        <div style={{ textAlign: "center", color: "#000" }}>
          <div style={{ fontWeight: 700, fontSize: `${shopFont}px`, textTransform: "uppercase", color: "#000" }}>
            Nhã Đan Shop
          </div>
          <div style={{ fontWeight: 700, fontSize: `${titleFont}px`, marginTop: 3, color: "#000" }}>
            PHIẾU NHẬP KHO
          </div>
          <div style={{ fontSize: `${baseFont}px`, marginTop: 1, color: "#000", fontWeight: 600 }}>
            {receipt.number}
          </div>
        </div>

        {divider}

        <div>
          <Row label="Ngày:" value={formatDate(receipt.date)} rightWidth={metaColWidth} fontSize={metaFont} />
          <Row label="NCC:" value={receipt.supplierName} rightWidth={metaColWidth} fontSize={metaFont} />
        </div>

        {divider}

        <div>
          {lines.map((line, i) => {
            const lineTotal = line.afterDiscount ?? line.quantity * line.unitCost * (1 - line.discountPercent / 100);
            return (
              <div key={line.id ?? i} style={{ marginBottom: is58 ? 3 : 4, color: "#000" }}>
                <div style={{ wordBreak: "break-word", fontWeight: 700, color: "#000" }}>
                  {line.productName}
                  {line.variantName ? ` - ${line.variantName}` : ""}
                </div>
                <div style={{ fontSize: `${baseFont - 0.5}px`, color: "#000", fontWeight: 500 }}>
                  {line.variantCode}
                  {line.expiryDate ? ` · HSD ${formatDate(line.expiryDate)}` : ""}
                </div>
                <Row
                  label={`${line.quantity} ${line.importUnit} × ${formatVND(line.unitCost)}${
                    line.discountPercent > 0 ? ` · CK ${line.discountPercent}%` : ""
                  }`}
                  value={formatVND(lineTotal)}
                  strong
                  fontSize={moneyFont}
                />
              </div>
            );
          })}
        </div>

        {divider}

        <div>
          <Row label="Tạm tính:" value={formatVND(subtotal)} fontSize={moneyFont} />
          {receipt.shippingFee > 0 && (
            <Row label="Phí vận chuyển:" value={formatVND(receipt.shippingFee)} fontSize={moneyFont} />
          )}
          {receipt.vat > 0 && <Row label="VAT:" value={formatVND(receipt.vat)} fontSize={moneyFont} />}
        </div>

        {solidDivider}
        <Row label="TỔNG CỘNG:" value={formatVND(total)} strong fontSize={totalFont} />

        {receipt.note ? (
          <>
            {divider}
            <div
              style={{
                fontSize: `${baseFont}px`,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#000",
                fontWeight: 500,
              }}
            >
              Ghi chú: {receipt.note}
            </div>
          </>
        ) : null}

        <div style={{ height: is58 ? "4mm" : "5mm" }} />
      </div>
    </div>
  );
}
