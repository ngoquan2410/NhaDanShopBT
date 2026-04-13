/**
 * BarcodeLabelPrinter — In nhãn mã vạch cho sản phẩm
 *
 * Mỗi nhãn gồm:
 *  - Mã vạch (Code128 / Code39)
 *  - Tên sản phẩm
 *  - Danh mục
 *  - Ngày nhập / lô nhập
 *  - Giá bán
 *
 * Hỗ trợ:
 *  - Chọn số lượng nhãn cần in
 *  - In nhiều sản phẩm cùng lúc
 *  - Preview trước khi in
 */
import { useEffect, useRef, useState } from 'react'

// Render 1 barcode SVG bằng JsBarcode (dynamic import)
function BarcodeImage({ value, width = 1.5, height = 50 }) {
  const svgRef = useRef(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!svgRef.current || !value) return
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width,
          height,
          displayValue: true,
          fontSize: 11,
          margin: 4,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch {
        setError(true)
      }
    }).catch(() => setError(true))
  }, [value, width, height])

  if (error) return <p className="text-red-500 text-xs">Lỗi tạo mã vạch</p>
  return <svg ref={svgRef} />
}

// ── 1 nhãn sản phẩm ──────────────────────────────────────────────────────────
function ProductLabel({ product, receiptDate, receiptNo, qty }) {
  const labels = []
  for (let i = 0; i < qty; i++) {
    labels.push(
      <div
        key={i}
        className="label-item"
        style={{
          width: '60mm',
          minHeight: '35mm',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '4px 6px',
          margin: '3px',
          display: 'inline-block',
          verticalAlign: 'top',
          background: '#fff',
          pageBreakInside: 'avoid',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Shop name */}
        <div style={{ textAlign: 'center', fontSize: '7px', color: '#666', marginBottom: '2px' }}>
          NHÃ ĐAN SHOP
        </div>

        {/* Product name */}
        <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center', marginBottom: '2px', lineHeight: 1.2 }}>
          {product.name}
        </div>

        {/* Barcode */}
        <div style={{ textAlign: 'center' }}>
          <BarcodeImage value={product.code} height={35} width={1.2} />
        </div>

        {/* Price */}
        <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: '#c00', marginTop: '2px' }}>
          {Number(product.sellPrice).toLocaleString('vi-VN')} ₫
        </div>

        {/* Category + Lô nhập */}
        <div style={{ fontSize: '7px', color: '#555', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
          <span>📂 {product.categoryName || product.category?.name || '—'}</span>
          {receiptDate && (
            <span>📅 {receiptDate}</span>
          )}
        </div>
        {receiptNo && (
          <div style={{ fontSize: '6px', color: '#888', textAlign: 'center' }}>
            Lô: {receiptNo}
          </div>
        )}
      </div>
    )
  }
  return <>{labels}</>
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BarcodeLabelPrinter({ items, receiptDate, receiptNo, onClose }) {
  // items: [{ product, qty }] — qty nhãn cần in mặc định = qty nhập kho

  const [labelQtys, setLabelQtys] = useState(() =>
    items.map(it => ({ ...it, labelQty: it.qty || 1 }))
  )
  const printRef = useRef(null)

  const handlePrint = () => {
    const content = printRef.current?.innerHTML
    if (!content) return

    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Nhãn sản phẩm — Nhã Đan Shop</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; background: #fff; }
          .label-item { page-break-inside: avoid; }
          @media print {
            body { margin: 5mm; }
            .label-item { border: 1px solid #999 !important; }
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        <\/script>
      </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-amber-600 text-white flex-shrink-0">
          <div>
            <h3 className="font-bold text-lg">🏷️ In nhãn mã vạch sản phẩm</h3>
            <p className="text-xs text-amber-100 mt-0.5">
              {receiptNo && `Phiếu nhập: ${receiptNo} | `}
              {receiptDate && `Ngày nhập: ${receiptDate}`}
            </p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none hover:opacity-70">&times;</button>
        </div>

        {/* Config - số lượng nhãn */}
        <div className="p-4 border-b flex-shrink-0">
          <p className="text-sm font-medium text-gray-700 mb-3">Chọn số lượng nhãn cần in:</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {labelQtys.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800 truncate">{it.product.name}</p>
                  <p className="text-xs text-gray-500">
                    Mã: <span className="font-mono">{it.product.code}</span>
                    {' | '}
                    Nhập: {it.qty} {it.product.unit || 'cái'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="text-xs text-gray-500">Số nhãn:</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={it.labelQty}
                    onChange={e => {
                      const r = e.target.value.replace(/\D/g, '')
                      setLabelQtys(prev => prev.map((x, i) => i === idx ? { ...x, labelQty: r } : x))
                    }}
                    onBlur={() => {
                      const n = parseInt(it.labelQty)
                      setLabelQtys(prev => prev.map((x, i) => i === idx
                        ? { ...x, labelQty: isNaN(n)||n<1?1:n>999?999:n } : x))
                    }}
                    className="w-16 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100">
          <p className="text-xs text-gray-500 mb-3 text-center">
            Preview nhãn (60mm × 35mm) — <span className="font-medium">{labelQtys.reduce((s, x) => s + x.labelQty, 0)} nhãn</span> tổng cộng
          </p>
          <div ref={printRef} style={{ textAlign: 'left' }}>
            {labelQtys.map((it, idx) => (
              <ProductLabel
                key={idx}
                product={it.product}
                receiptDate={receiptDate}
                receiptNo={receiptNo}
                qty={it.labelQty}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-white flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Đóng
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 flex items-center gap-2"
          >
            🖨️ In nhãn
          </button>
        </div>
      </div>
    </div>
  )
}
