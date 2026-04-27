import { useState } from "react";
import { X, Printer, Barcode as BarcodeIcon, Minus, Plus } from "lucide-react";
import { triggerPrint } from "@/lib/print";
import { formatVND } from "@/lib/format";
import { Barcode } from "@/components/shared/Barcode";

export interface BarcodeItem {
  productName: string;
  variantName?: string;
  code: string;
  price?: number;
  lot?: string;
  defaultQty?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: BarcodeItem[];
  title?: string;
}

/** Renders pseudo barcode bars from a string deterministically. */
function BarcodeBars({ code }: { code: string }) {
  const widths = code.split("").map((ch, i) => ((ch.charCodeAt(0) + i) % 4) + 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 36 }}>
      {widths.map((w, i) => (
        <div
          key={i}
          style={{
            width: `${w}px`,
            height: "100%",
            background: i % 2 === 0 ? "#000" : "transparent",
          }}
        />
      ))}
    </div>
  );
}

export function BarcodePrintDialog({ open, onClose, items, title = "In mã vạch" }: Props) {
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((it) => [it.code, Math.max(1, it.defaultQty ?? 1)]))
  );

  if (!open) return null;

  const setQty = (code: string, n: number) =>
    setQtys((prev) => ({ ...prev, [code]: Math.max(1, Math.min(500, n)) }));

  const labels: BarcodeItem[] = items.flatMap((it) =>
    Array(qtys[it.code] ?? 1).fill(it)
  );
  const totalLabels = labels.length;

  const doPrint = () => triggerPrint(`${totalLabels} tem mã vạch (POS58)`, "pos58", { targetId: "print-area-barcodes" });

  return (
    <>
      {/* Modal — hidden from print */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl bg-card border rounded-lg shadow-xl flex flex-col max-h-[85vh]">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarcodeIcon className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm">{title}</h2>
              <span className="text-xs text-muted-foreground">· {totalLabels} tem</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
          </div>

          {/* Quantity controls */}
          <div className="p-4 border-b max-h-48 overflow-y-auto space-y-2">
            {items.map((it) => (
              <div key={it.code} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{it.productName}{it.variantName ? ` — ${it.variantName}` : ""}</p>
                  <p className="text-xs text-muted-foreground font-mono">{it.code}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setQty(it.code, (qtys[it.code] ?? 1) - 1)} className="h-7 w-7 grid place-items-center border rounded hover:bg-muted"><Minus className="h-3 w-3" /></button>
                  <input
                    type="number"
                    value={qtys[it.code] ?? 1}
                    onChange={(e) => setQty(it.code, +e.target.value)}
                    className="w-14 h-7 text-center text-xs border rounded bg-background"
                  />
                  <button onClick={() => setQty(it.code, (qtys[it.code] ?? 1) + 1)} className="h-7 w-7 grid place-items-center border rounded hover:bg-muted"><Plus className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-y-auto p-4 bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">Xem trước tem ({totalLabels})</p>
            <div className="grid grid-cols-3 gap-2">
              {labels.slice(0, 24).map((l, i) => (
                <LabelPreview key={i} item={l} />
              ))}
              {labels.length > 24 && (
                <div className="col-span-3 text-center text-xs text-muted-foreground py-2">
                  + {labels.length - 24} tem khác sẽ được in
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t flex gap-2">
            <button onClick={onClose} className="flex-1 px-3 py-2 text-sm border rounded-md hover:bg-muted">Đóng</button>
            <button onClick={doPrint} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover">
              <Printer className="h-4 w-4" /> In POS58 — {totalLabels} tem
            </button>
          </div>
        </div>
      </div>

      {/* Hidden print area — POS58 thermal-safe single-column labels */}
      <div className="print-area print-root" id="print-area-barcodes">
        <div
          data-thermal-root
          style={{
            width: "41mm",
            maxWidth: "41mm",
            paddingLeft: "1.5mm",
            paddingRight: "1.5mm",
            paddingTop: "1mm",
            paddingBottom: "1mm",
            margin: 0,
            background: "#fff",
            color: "#000",
            fontFamily: "Arial, Helvetica, system-ui, sans-serif",
          }}
        >
          {labels.map((l, i) => (
            <LabelPreview key={i} item={l} forPrint />
          ))}
        </div>
      </div>
    </>
  );
}

function LabelPreview({ item, forPrint }: { item: BarcodeItem; forPrint?: boolean }) {
  return (
    <div
      style={{
        border: forPrint ? "none" : "1px solid #000",
        borderBottom: forPrint ? "1px dashed #000" : "1px solid #000",
        padding: forPrint ? "2mm 0" : 6,
        background: "white",
        color: "#000",
        fontFamily: "Arial, Helvetica, system-ui, sans-serif",
        fontSize: forPrint ? "8pt" : "10px",
        textAlign: "center",
        lineHeight: 1.2,
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: forPrint ? "7pt" : "9px", color: "#000" }}>Nhã Đan Shop</div>
      <div style={{ fontWeight: 700, color: "#000", wordBreak: "break-word" }}>{item.productName}</div>
      {item.variantName && (
        <div style={{ color: "#000", fontWeight: 500 }}>{item.variantName}</div>
      )}
      <div style={{ display: "flex", justifyContent: "center", margin: "3px 0" }}>
        <Barcode
          value={item.code}
          format="CODE128"
          height={forPrint ? 38 : 50}
          width={forPrint ? 1.2 : 1.5}
          fontSize={forPrint ? 8 : 10}
          margin={2}
          displayValue
        />
      </div>
      {item.price != null && (
        <div style={{ fontWeight: 700, marginTop: 2, color: "#000" }}>{formatVND(item.price)}</div>
      )}
      {item.lot && (
        <div style={{ color: "#000", marginTop: 1, fontSize: forPrint ? "7pt" : "9px", fontWeight: 500 }}>Lô: {item.lot}</div>
      )}
    </div>
  );
}
