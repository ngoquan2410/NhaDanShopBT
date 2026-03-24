import { useState, useEffect, useRef } from 'react'
import { useInvoices, useInvoiceMutations } from '../../hooks/useInvoices'
import { useProducts } from '../../hooks/useProducts'
import { useSort } from '../../hooks/useSort'
import { usePendingOrders } from '../../hooks/usePendingOrders'
import PendingOrdersTab from './PendingOrdersTab'
import dayjs from 'dayjs'

// ── Shared invoice HTML builder (cũng dùng ở StorefrontPage) ─────────────────
export function buildInvoiceHtml(inv) {
  const fmt = n => Number(n || 0).toLocaleString('vi-VN')
  const items = (inv.items || []).map(i =>
    `<tr>
      <td>${i.productName || i.productCode || ''}</td>
      <td align="center">${i.quantity}</td>
      <td align="right">${fmt(i.unitPrice)} ₫</td>
      <td align="right">${fmt(i.lineTotal ?? (i.quantity * i.unitPrice))} ₫</td>
    </tr>`
  ).join('')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hóa đơn ${inv.invoiceNo}</title>
<style>
  @media print{body{margin:0}}
  body{font-family:'Be Vietnam Pro',Arial,sans-serif;padding:20px;font-size:13px;max-width:400px;margin:0 auto}
  h2{text-align:center;color:#166534;margin:0 0 4px}
  .shop-info{text-align:center;font-size:11px;color:#555;margin-bottom:12px}
  hr{border:none;border-top:1px dashed #ccc;margin:10px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{padding:5px 6px;font-size:12px;border-bottom:1px solid #eee}
  th{background:#f0fdf4;font-weight:600;text-align:left}
  .total{font-size:15px;font-weight:bold;color:#166534;text-align:right;margin-top:10px}
  .footer{text-align:center;margin-top:16px;font-size:11px;color:#888}
</style></head><body>
<h2>🛒 NHÃ ĐAN SHOP</h2>
<div class="shop-info">
  235, Ấp 5, Xã Mỏ Cày, Tỉnh Vĩnh Long<br/>
  SĐT: 0975 505 074 – 0996 425 503
</div>
<hr/>
<p style="font-size:12px"><b>Hóa đơn:</b> ${inv.invoiceNo}</p>
<p style="font-size:12px"><b>Ngày:</b> ${dayjs(inv.invoiceDate || new Date()).format('DD/MM/YYYY HH:mm')}</p>
<p style="font-size:12px"><b>Khách hàng:</b> ${inv.customerName || 'Khách lẻ'}</p>
${inv.note ? `<p style="font-size:12px"><b>Ghi chú:</b> ${inv.note}</p>` : ''}
<table>
  <tr><th>Sản phẩm</th><th style="text-align:center">SL</th><th style="text-align:right">Đơn giá</th><th style="text-align:right">Tiền</th></tr>
  ${items}
</table>
<div class="total">Tổng cộng: ${fmt(inv.totalAmount)} ₫</div>
<hr/>
<div class="footer">Cảm ơn quý khách! Hẹn gặp lại 😊<br/>FB: facebook.com/duongthi.mylinh.5</div>
</body></html>`
}

function printInvoice(inv) {
  const win = window.open('', '_blank', 'width=450,height=650')
  win.document.write(buildInvoiceHtml(inv))
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

// ── Barcode Scanner Component ─────────────────────────────────────────────────
function BarcodeScanner({ products, onScan, onClose }) {
  const videoRef = useRef(null)
  const [manualCode, setManualCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const readerRef = useRef(null)

  useEffect(() => {
    let active = true
    async function startScan() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader
        setScanning(true)
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (devices.length === 0) { setError('Không tìm thấy camera'); return }
        const deviceId = devices[devices.length - 1].deviceId // prefer back camera
        reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
          if (!active) return
          if (result) {
            const code = result.getText()
            const product = products.find(p => p.code === code || p.code === code.toUpperCase())
            if (product) {
              onScan(product)
              setError('')
            } else {
              setError(`Không tìm thấy sản phẩm với mã: ${code}`)
            }
          }
        })
      } catch (e) {
        setError('Lỗi khởi động camera: ' + e.message)
      }
    }
    startScan()
    return () => {
      active = false
      readerRef.current?.reset()
    }
  }, [])

  const handleManual = (e) => {
    e.preventDefault()
    const code = manualCode.trim().toUpperCase()
    const product = products.find(p => p.code === code)
    if (product) { onScan(product); setManualCode(''); setError('') }
    else setError(`Không tìm thấy sản phẩm: ${code}`)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-green-700 text-white">
          <h3 className="font-bold text-lg">📷 Quét mã sản phẩm</h3>
          <button onClick={onClose} className="text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          {/* Camera view */}
          <div className="relative bg-black rounded-xl overflow-hidden" style={{aspectRatio:'4/3'}}>
            <video ref={videoRef} className="w-full h-full object-cover" />
            {/* Scan frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-4 border-green-400 rounded-xl opacity-80 shadow-lg" />
            </div>
            {scanning && (
              <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-white bg-black/40 py-1">
                Đưa mã vạch vào khung xanh
              </div>
            )}
          </div>

          {error && <p className="text-red-600 text-sm text-center bg-red-50 rounded-lg py-2 px-3">{error}</p>}

          {/* Manual input fallback */}
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 text-center">Hoặc nhập mã thủ công</p>
            <form onSubmit={handleManual} className="flex gap-2">
              <input
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Nhập mã sản phẩm (VD: BT001)..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
              <button type="submit"
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700">
                Thêm
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Invoice Form with barcode ─────────────────────────────────────────────────
function InvoiceForm({ products, onSubmit, loading }) {
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState([{ productId: '', quantity: 1 }])
  const [showScanner, setShowScanner] = useState(false)

  const addItem = () => setItems(i => [...i, { productId: '', quantity: 1 }])
  const removeItem = (idx) => setItems(i => i.filter((_, j) => j !== idx))
  const setItem = (idx, key, val) =>
    setItems(i => i.map((it, j) => j === idx ? { ...it, [key]: val } : it))

  const getProduct = (id) => products.find(p => String(p.id) === String(id))

  const handleScanResult = (product) => {
    const existing = items.find(i => String(i.productId) === String(product.id))
    if (existing) {
      setItems(prev => prev.map(i =>
        String(i.productId) === String(product.id) ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      const emptyIdx = items.findIndex(i => !i.productId)
      if (emptyIdx >= 0) {
        setItem(emptyIdx, 'productId', String(product.id))
      } else {
        setItems(prev => [...prev, { productId: String(product.id), quantity: 1 }])
      }
    }
  }

  const total = items.reduce((s, it) => {
    const p = getProduct(it.productId)
    return s + (p ? Number(p.sellPrice) * Number(it.quantity) : 0)
  }, 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    const validItems = items.filter(i => i.productId)
    if (!validItems.length) return
    onSubmit({ customerName, note, items: validItems.map(it => ({ productId: Number(it.productId), quantity: Number(it.quantity) })) })
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Khách hàng</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Tên khách hàng (tùy chọn)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ghi chú (tùy chọn)" />
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-700">Chi tiết nhập hàng</h4>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowScanner(true)}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1">
                📷 Quét mã
              </button>
              <button type="button" onClick={addItem}
                className="text-green-600 hover:text-green-700 text-sm font-medium">+ Thêm dòng</button>
            </div>
          </div>
          {items.map((item, idx) => {
            const p = getProduct(item.productId)
            return (
              <div key={idx} className="flex gap-2 mb-2 items-end">
                <div className="flex-1">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sản phẩm *</label>}
                  <select value={item.productId} onChange={e => setItem(idx, 'productId', e.target.value)}
                    required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">-- Chọn sản phẩm --</option>
                    {products.filter(prod => prod.active && prod.stockQty > 0).map(prod => (
                      <option key={prod.id} value={prod.id}>
                        {prod.code} - {prod.name} (Tồn: {prod.stockQty} {prod.sellUnit || prod.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Số lượng</label>}
                  <input type="number" min={1} max={p?.stockQty || 9999} value={item.quantity}
                    onChange={e => setItem(idx, 'quantity', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="w-32 text-right pb-2 text-sm text-gray-600">
                  {p ? `${(Number(p.sellPrice) * Number(item.quantity)).toLocaleString('vi-VN')} ₫` : '—'}
                </div>
                <button type="button" onClick={() => removeItem(idx)}
                  className="text-red-500 hover:text-red-700 pb-2 text-lg">&times;</button>
              </div>
            )
          })}
          <div className="text-right mt-3 font-semibold text-green-700 text-lg">
            Tổng cộng: {total.toLocaleString('vi-VN')} ₫
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading}
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
            {loading ? 'Đang tạo...' : 'Tạo hóa đơn bán'}
          </button>
        </div>
      </form>

      {showScanner && (
        <BarcodeScanner
          products={products}
          onScan={handleScanResult}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  )
}

// ── Invoice Detail + Print ────────────────────────────────────────────────────
function InvoiceDetail({ inv, onClose }) {
  return (
    <Modal title={`Chi tiết hóa đơn ${inv.invoiceNo}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-gray-500">Khách hàng:</span> <b>{inv.customerName || '—'}</b></div>
          <div><span className="text-gray-500">Ngày:</span> <b>{dayjs(inv.invoiceDate).format('DD/MM/YYYY HH:mm')}</b></div>
          <div><span className="text-gray-500">Người tạo:</span> {inv.createdBy}</div>
          <div><span className="text-gray-500">Ghi chú:</span> {inv.note || '—'}</div>
        </div>
        <table className="w-full border rounded-lg overflow-hidden mt-3">
          <thead className="bg-gray-50">
            <tr className="text-gray-600 text-xs">
              <th className="text-left px-3 py-2">Sản phẩm</th>
              <th className="text-right px-3 py-2">SL</th>
              <th className="text-right px-3 py-2">Đơn giá</th>
              <th className="text-right px-3 py-2">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {inv.items?.map((it, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{it.productName}</td>
                <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                <td className="px-3 py-2 text-right">{Number(it.unitPrice).toLocaleString('vi-VN')}</td>
                <td className="px-3 py-2 text-right font-medium">{Number(it.lineTotal).toLocaleString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 text-sm font-semibold">
            <tr>
              <td colSpan={3} className="px-3 py-2 text-right">Tổng doanh thu:</td>
              <td className="px-3 py-2 text-right text-green-700">{Number(inv.totalAmount).toLocaleString('vi-VN')} ₫</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-3 py-2 text-right">Lợi nhuận:</td>
              <td className="px-3 py-2 text-right text-blue-600">{Number(inv.totalProfit).toLocaleString('vi-VN')} ₫</td>
            </tr>
          </tfoot>
        </table>
        <div className="flex justify-end pt-2">
          <button onClick={() => printInvoice(inv)}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 font-medium">
            🖨️ In hóa đơn
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoicesPage() {
  const [page, setPage] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [newInvoice, setNewInvoice] = useState(null)
  const [activeTab, setActiveTab] = useState('invoices') // 'invoices' | 'pending'

  const { data, isLoading } = useInvoices(page, from || undefined, to || undefined)
  const { data: products = [] } = useProducts()
  const { create, remove } = useInvoiceMutations()
  const { data: pendingOrders = [] } = usePendingOrders()

  const invoices = data?.content || []
  const totalPages = data?.totalPages || 1
  const { sorted: sortedInvoices, SortHeader } = useSort(invoices, 'invoiceDate', 'desc')
  const pendingCount = pendingOrders.filter(o => o.status === 'PENDING').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Hóa Đơn Bán Hàng</h2>
        {activeTab === 'invoices' && (
          <button onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
            + Tạo hóa đơn bán
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-0">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'invoices'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📄 Hóa đơn đã bán
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-yellow-500 text-yellow-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ⏳ Đơn chờ thanh toán
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'pending' ? (
        <PendingOrdersTab />
      ) : (
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0) }}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0) }}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {(from || to) && (
              <button onClick={() => { setFrom(''); setTo('') }}
                className="text-gray-500 hover:text-gray-700 text-sm">✕ Xóa lọc</button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b text-sm">
                  <SortHeader field="invoiceNo" className="text-left px-4 py-3">Số HĐ</SortHeader>
                  <SortHeader field="customerName" className="text-left px-4 py-3">Khách hàng</SortHeader>
                  <SortHeader field="invoiceDate" className="text-left px-4 py-3">Ngày bán</SortHeader>
                  <SortHeader field="totalAmount" className="text-right px-4 py-3">Tổng tiền</SortHeader>
                  <SortHeader field="totalProfit" className="text-right px-4 py-3">Lợi nhuận</SortHeader>
                  <th className="text-left px-4 py-3">Ghi chú</th>
                  <th className="text-center px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
                ) : sortedInvoices.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Chưa có hóa đơn</td></tr>
                ) : sortedInvoices.map(inv => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-blue-600 cursor-pointer hover:underline"
                      onClick={() => setDetail(inv)}>{inv.invoiceNo}</td>
                    <td className="px-4 py-3">{inv.customerName || '—'}</td>
                    <td className="px-4 py-3">{dayjs(inv.invoiceDate).format('DD/MM/YYYY HH:mm')}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">
                      {Number(inv.totalAmount).toLocaleString('vi-VN')} ₫
                    </td>
                    <td className="px-4 py-3 text-right text-blue-600">
                      {Number(inv.totalProfit).toLocaleString('vi-VN')} ₫
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{inv.note || '—'}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap space-x-2">
                      <button onClick={() => printInvoice(inv)}
                        className="text-blue-600 hover:text-blue-800 text-xs">🖨️ In</button>
                      <button onClick={() => setDetail(inv)}
                        className="text-gray-600 hover:text-gray-800 text-xs">👁️ Xem</button>
                      <button onClick={() => { if (window.confirm('Xóa hóa đơn này?')) remove.mutate(inv.id) }}
                        className="text-red-600 hover:text-red-800 text-xs">🗑️ Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">← Trước</button>
            <span className="text-sm text-gray-500">Trang {page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">Sau →</button>
          </div>
        </div>
      )}

      {showModal && (
        <Modal title="Tạo hóa đơn bán hàng" onClose={() => setShowModal(false)}>
          <InvoiceForm
            products={products}
            onSubmit={async (d) => {
              const inv = await create.mutateAsync(d)
              setShowModal(false)
              setNewInvoice(inv) // trigger print prompt
            }}
            loading={create.isLoading}
          />
        </Modal>
      )}

      {detail && <InvoiceDetail inv={detail} onClose={() => setDetail(null)} />}

      {/* Print prompt after creating invoice */}
      {newInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-xl font-bold text-gray-800 mb-1">Tạo hóa đơn thành công!</h3>
            <p className="text-gray-500 text-sm mb-6">
              <span className="font-mono font-bold text-green-700">{newInvoice.invoiceNo}</span>
              {' '}— {Number(newInvoice.totalAmount).toLocaleString('vi-VN')} ₫
            </p>
            <div className="flex gap-3">
              <button onClick={() => setNewInvoice(null)}
                className="flex-1 border rounded-xl py-2.5 text-gray-600 hover:bg-gray-50">Đóng</button>
              <button onClick={() => { printInvoice(newInvoice); setNewInvoice(null) }}
                className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 font-semibold hover:bg-blue-700">
                🖨️ In hóa đơn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
