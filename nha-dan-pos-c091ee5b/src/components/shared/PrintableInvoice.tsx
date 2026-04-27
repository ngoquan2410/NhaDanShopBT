import type { Invoice, InvoiceLine } from "@/lib/mock-data";
import { formatVND, formatDateTime } from "@/lib/format";

interface Props {
  invoice: Invoice;
  lines: InvoiceLine[];
}

export function PrintableInvoice({ invoice, lines }: Props) {
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

  return (
    <div className="print-area" id="print-area-invoice">
      <div style={{ padding: "16px", fontFamily: "Arial, sans-serif", color: "#000", fontSize: "12pt" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <h1 style={{ fontSize: "18pt", margin: 0 }}>Nhã Đan Shop</h1>
          <p style={{ margin: "2px 0", fontSize: "10pt" }}>123 Nguyễn Văn Linh, Q7, TP.HCM · 0901 234 567</p>
          <h2 style={{ fontSize: "14pt", margin: "12px 0 4px" }}>HÓA ĐƠN BÁN HÀNG</h2>
          <p style={{ margin: 0, fontFamily: "monospace" }}>{invoice.number}</p>
        </div>

        <table style={{ width: "100%", fontSize: "10pt", marginBottom: 12 }}>
          <tbody>
            <tr><td>Thời gian:</td><td style={{ textAlign: "right" }}>{formatDateTime(invoice.date)}</td></tr>
            <tr><td>Khách hàng:</td><td style={{ textAlign: "right" }}>{invoice.customerName}</td></tr>
            <tr><td>Người tạo:</td><td style={{ textAlign: "right" }}>{invoice.createdBy}</td></tr>
            <tr><td>Thanh toán:</td><td style={{ textAlign: "right", textTransform: "uppercase" }}>{invoice.paymentType}</td></tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
          <thead>
            <tr style={{ borderTop: "1px solid #000", borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left", padding: "4px 2px" }}>Sản phẩm</th>
              <th style={{ textAlign: "center", padding: "4px 2px" }}>SL</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>Đơn giá</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>T.Tiền</th>
            </tr>
          </thead>
          <tbody>
            {billable.map((l, i) => (
              <tr key={`b${i}`} style={{ borderBottom: "1px dashed #999" }}>
                <td style={{ padding: "4px 2px" }}>
                  {l.name}
                  <div style={{ fontSize: "8pt", color: "#555" }}>{l.code}</div>
                </td>
                <td style={{ textAlign: "center", padding: "4px 2px" }}>{l.qty}</td>
                <td style={{ textAlign: "right", padding: "4px 2px" }}>{formatVND(l.price)}</td>
                <td style={{ textAlign: "right", padding: "4px 2px" }}>{formatVND(l.qty * l.price)}</td>
              </tr>
            ))}
            {rewards.map((l, i) => (
              <tr key={`r${i}`} style={{ borderBottom: "1px dashed #999", color: "#666" }}>
                <td style={{ padding: "4px 2px" }}>
                  🎁 {l.name}
                  <div style={{ fontSize: "8pt" }}>{l.code}{l.rewardSource ? ` · ${l.rewardSource}` : ""}</div>
                </td>
                <td style={{ textAlign: "center", padding: "4px 2px" }}>{l.qty}</td>
                <td style={{ textAlign: "right", padding: "4px 2px" }}>—</td>
                <td style={{ textAlign: "right", padding: "4px 2px" }}>Miễn phí</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table style={{ width: "100%", marginTop: 12, fontSize: "11pt" }}>
          <tbody>
            <tr><td>Tạm tính:</td><td style={{ textAlign: "right" }}>{formatVND(b.subtotal)}</td></tr>
            {b.manualDiscount > 0 && <tr><td>Chiết khấu thủ công:</td><td style={{ textAlign: "right" }}>-{formatVND(b.manualDiscount)}</td></tr>}
            {b.promoDiscount > 0 && <tr><td>Khuyến mãi{b.promoName ? ` (${b.promoName})` : ""}:</td><td style={{ textAlign: "right" }}>-{formatVND(b.promoDiscount)}</td></tr>}
            {voucherDiscount > 0 && <tr><td>Voucher{b.voucherName ? ` (${b.voucherName})` : ""}:</td><td style={{ textAlign: "right" }}>-{formatVND(voucherDiscount)}</td></tr>}
            {(b.shippingFee > 0) && <tr><td>Phí ship:</td><td style={{ textAlign: "right" }}>{formatVND(b.shippingFee)}</td></tr>}
            {b.shippingDiscount > 0 && <tr><td>Ưu đãi ship:</td><td style={{ textAlign: "right" }}>-{formatVND(b.shippingDiscount)}</td></tr>}
            {(b.shippingZoneCode || b.shippingEtaMin) && (
              <tr>
                <td>Giao hàng:</td>
                <td style={{ textAlign: "right" }}>
                  {[
                    b.shippingZoneCode ? `${b.shippingZoneCode}${b.shippingZoneLabel ? ` · ${b.shippingZoneLabel}` : ""}` : null,
                    b.shippingEtaMin && b.shippingEtaMax ? `Dự kiến ${b.shippingEtaMin}–${b.shippingEtaMax} ngày` : null,
                  ].filter(Boolean).join(" · ")}
                </td>
              </tr>
            )}
            {b.vatAmount > 0 && <tr><td>VAT ({b.vatPercent}%):</td><td style={{ textAlign: "right" }}>+{formatVND(b.vatAmount)}</td></tr>}
            <tr style={{ borderTop: "1px solid #000", fontWeight: "bold", fontSize: "13pt" }}>
              <td style={{ paddingTop: 6 }}>TỔNG CỘNG:</td>
              <td style={{ textAlign: "right", paddingTop: 6 }}>{formatVND(b.total)}</td>
            </tr>
          </tbody>
        </table>

        <p style={{ textAlign: "center", marginTop: 18, fontSize: "10pt" }}>
          Cảm ơn quý khách. Hẹn gặp lại!
        </p>
      </div>
    </div>
  );
}
