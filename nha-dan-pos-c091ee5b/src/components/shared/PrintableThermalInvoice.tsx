import type { Invoice, InvoiceLine } from "@/lib/pos-print-types";
import { formatVND, formatDateTime } from "@/lib/format";

export type ThermalPaperMode = "pos58" | "pos80";

interface Props {
  invoice: Invoice;
  lines: InvoiceLine[];
  paper: ThermalPaperMode;
  rootId?: string;
}

// Thermal-safe font stack: no decorative web fonts, full Vietnamese diacritic support
const THERMAL_FONT = "Arial, Helvetica, system-ui, sans-serif";

export function PrintableThermalInvoice({ invoice, lines, paper, rootId }: Props) {
  const billable = lines.filter((l) => !l.reward);
  const rewards = lines.filter((l) => l.reward);
  const computedSubtotal = billable.reduce((s, l) => s + l.qty * l.price, 0);

  const b = invoice.breakdown ?? {
    subtotal: computedSubtotal,
    manualDiscount: 0,
    promoDiscount: Math.max(0, computedSubtotal - invoice.total),
    promoName: undefined,
    voucherDiscount: 0,
    voucherName: undefined,
    shippingFee: 0,
    shippingDiscount: 0,
    shippingPayable: 0,
    vatPercent: 0,
    vatBase: invoice.total,
    vatAmount: 0,
    total: invoice.total,
    freeItems: [],
  };
  const voucherDiscount = b.voucherDiscount ?? 0;

  const is58 = paper === "pos58";
  // Ultra-conservative inner width — printable area on POS58 thermal heads is
  // often <48mm. Tighten to 41mm with extra side padding so the right edge
  // never clips on real paper.
  const paperWidth = is58 ? 58 : 80;
  const innerWidth = is58 ? "41mm" : "70mm";
  const sidePad = is58 ? "1.5mm" : "1mm";
  const baseFont = is58 ? 10 : 11;
  const metaFont = is58 ? 10 : 11;
  const moneyFont = is58 ? 10.5 : 11.5;
  const totalFont = is58 ? 12 : 14;
  const titleFont = is58 ? 12 : 14;
  const shopFont = is58 ? 13 : 15;
  // Right (amount) column fixed width — keeps values fully inside printable area.
  const amountColWidth = is58 ? "21mm" : "30mm";
  const metaColWidth = is58 ? "26mm" : "40mm";

  // Safe 2-column row: fixed-width right column, left wraps inside its cell.
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
      id={rootId ?? `print-root-invoice-${paper}`}
      className="print-root"
      data-print-root="invoice"
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
          <div style={{ fontSize: `${baseFont}px`, color: "#000", fontWeight: 500 }}>
            123 Nguyễn Văn Linh, Q7, TP.HCM
          </div>
          <div style={{ fontSize: `${baseFont}px`, color: "#000", fontWeight: 500 }}>0901 234 567</div>
          <div style={{ fontWeight: 700, fontSize: `${titleFont}px`, marginTop: 3, color: "#000" }}>
            HÓA ĐƠN BÁN HÀNG
          </div>
          <div style={{ fontSize: `${baseFont}px`, marginTop: 1, color: "#000", fontWeight: 600 }}>
            {invoice.number}
          </div>
        </div>

        {divider}

        <div>
          <Row label="Ngày:" value={formatDateTime(invoice.date)} rightWidth={metaColWidth} fontSize={metaFont} />
          <Row label="KH:" value={invoice.customerName} rightWidth={metaColWidth} fontSize={metaFont} />
          <Row label="NV:" value={invoice.createdBy} rightWidth={metaColWidth} fontSize={metaFont} />
          <Row label="TT:" value={invoice.paymentType.toUpperCase()} rightWidth={metaColWidth} fontSize={metaFont} />
        </div>

        {divider}

        <div>
          {billable.map((line, i) => (
            <div key={`billable-${i}`} style={{ marginBottom: is58 ? 3 : 4, color: "#000" }}>
              <div style={{ wordBreak: "break-word", fontWeight: 700, color: "#000" }}>{line.name}</div>
              {line.code ? (
                <div style={{ fontSize: `${baseFont - 0.5}px`, color: "#000", fontWeight: 500 }}>{line.code}</div>
              ) : null}
              <Row
                label={`${line.qty} × ${formatVND(line.price)}`}
                value={formatVND(line.qty * line.price)}
                strong
                fontSize={moneyFont}
              />
            </div>
          ))}

          {rewards.map((line, i) => (
            <div key={`reward-${i}`} style={{ marginBottom: is58 ? 3 : 4, color: "#000" }}>
              <div style={{ wordBreak: "break-word", fontWeight: 700, color: "#000" }}>
                [QUÀ TẶNG] {line.name}
              </div>
              <div style={{ fontSize: `${baseFont - 0.5}px`, color: "#000", fontWeight: 500 }}>
                {line.rewardSource ? `Tặng từ KM ${line.rewardSource}` : "Tặng từ khuyến mãi"}
              </div>
              <Row label={`SL ${line.qty}`} value="Miễn phí" strong fontSize={moneyFont} />
            </div>
          ))}
        </div>

        {divider}

        <div>
          <Row label="Tạm tính:" value={formatVND(b.subtotal)} fontSize={moneyFont} />
          {b.manualDiscount > 0 && (
            <Row label="CK thủ công:" value={`-${formatVND(b.manualDiscount)}`} fontSize={moneyFont} />
          )}
          {b.promoDiscount > 0 && (
            <Row
              label={`Khuyến mãi${b.promoName ? ` (${b.promoName})` : ""}:`}
              value={`-${formatVND(b.promoDiscount)}`}
              fontSize={moneyFont}
            />
          )}
          {voucherDiscount > 0 && (
            <Row
              label={`Voucher${b.voucherName ? ` (${b.voucherName})` : ""}:`}
              value={`-${formatVND(voucherDiscount)}`}
              fontSize={moneyFont}
            />
          )}
          {b.shippingFee > 0 && <Row label="Phí ship:" value={formatVND(b.shippingFee)} fontSize={moneyFont} />}
          {b.shippingDiscount > 0 && (
            <Row label="Ưu đãi ship:" value={`-${formatVND(b.shippingDiscount)}`} fontSize={moneyFont} />
          )}
          {(b.shippingZoneCode || b.shippingEtaMin) && (
            <Row
              label="Giao hàng:"
              value={
                [
                  b.shippingZoneCode ? `${b.shippingZoneCode}${b.shippingZoneLabel ? ` · ${b.shippingZoneLabel}` : ""}` : null,
                  b.shippingEtaMin && b.shippingEtaMax
                    ? `${b.shippingEtaMin}–${b.shippingEtaMax} ngày`
                    : null,
                ].filter(Boolean).join(" · ")
              }
              fontSize={metaFont}
            />
          )}
          {b.vatAmount > 0 && (
            <Row label={`VAT (${b.vatPercent}%):`} value={`+${formatVND(b.vatAmount)}`} fontSize={moneyFont} />
          )}
        </div>

        {solidDivider}
        <Row label="TỔNG CỘNG:" value={formatVND(b.total)} strong fontSize={totalFont} />

        {invoice.note ? (
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
              Ghi chú: {invoice.note}
            </div>
          </>
        ) : null}

        {divider}
        <div style={{ textAlign: "center", fontSize: `${baseFont}px`, color: "#000", fontWeight: 600 }}>
          Cảm ơn quý khách. Hẹn gặp lại!
        </div>
        <div style={{ height: is58 ? "4mm" : "5mm" }} />
      </div>
    </div>
  );
}
