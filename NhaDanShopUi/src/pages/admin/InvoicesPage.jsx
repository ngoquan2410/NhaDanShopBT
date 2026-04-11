import { useState, useEffect, useRef } from 'react'
import { useInvoices, useInvoiceMutations } from '../../hooks/useInvoices'
import { useProducts } from '../../hooks/useProducts'
import { useSort } from '../../hooks/useSort'
import { usePendingOrders } from '../../hooks/usePendingOrders'
import { useQuery } from '@tanstack/react-query'
import { promotionService } from '../../services/promotionService'
import { customerService } from '../../services/customerService'
import PendingOrdersTab from './PendingOrdersTab'
import BarcodeScanner from '../../components/BarcodeScanner'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import { AdminTable, AdminPageHeader, AdminCard } from '../../components/admin/AdminTable'

// ── Shared invoice HTML builder (cũng dùng ở StorefrontPage) ─────────────────
export function buildInvoiceHtml(inv) {
  const fmt = n => Number(n || 0).toLocaleString('vi-VN')
  const items = (inv.items || []).map(i => {
    const disc = Number(i.lineDiscountPercent || 0)
    const discNote = disc > 0 ? ` <span style="color:#d97706;font-size:10px">(CK ${disc}%)</span>` : ''
    return `<tr>
      <td>${i.productName || i.productCode || ''}${discNote}</td>
      <td align="center">${i.quantity}</td>
      <td align="right">${fmt(i.unitPrice)} ₫</td>
      <td align="right">${fmt(i.lineTotal ?? (i.quantity * i.unitPrice))} ₫</td>
    </tr>`
  }).join('')
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
${Number(inv.discountAmount) > 0 ? `<div style="text-align:right;color:#d97706;font-size:13px">🎉 ${inv.promotionName || 'KM'}: -${fmt(inv.discountAmount)} ₫</div>
<div class="total">Thanh toán: ${fmt(Number(inv.finalAmount ?? inv.totalAmount))} ₫</div>` : ''}
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
  const [customerId, setCustomerId]     = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [searchDone, setSearchDone]     = useState(false)  // đã search xong chưa
  const [note, setNote] = useState('')
  const [items, setItems] = useState([{ productId: '', variantId: '', quantity: 1, discountPercent: 0 }])
  const [showScanner, setShowScanner] = useState(false)
  const [selectedPromoId, setSelectedPromoId] = useState('')
  const custSearchTimer = useRef(null)

  // ── Tạo KH mới inline ────────────────────────────────────────────────────
  const [showCreateCust, setShowCreateCust] = useState(false)
  const [newCustName, setNewCustName]   = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [creatingCust, setCreatingCust] = useState(false)

  const isPhoneLike = (s) => /^0\d{7,9}$/.test(s.replace(/\s/g, ''))

  const { data: activePromos = [] } = useQuery({
    queryKey: ['promotions-active'],
    queryFn: promotionService.getActive,
  })

  // Search customer — debounce 350ms, hiện "Tạo mới" nếu không có kết quả
  const handleCustomerSearch = (val) => {
    setCustomerSearch(val)
    setSearchDone(false)
    setShowCreateCust(false)
    setCustomerResults([])
    if (!val.trim()) return
    clearTimeout(custSearchTimer.current)
    custSearchTimer.current = setTimeout(async () => {
      try {
        const res = await customerService.getAll(val.trim())
        const list = Array.isArray(res) ? res : (res.content || [])
        setCustomerResults(list.slice(0, 6))
        setSearchDone(true)
        if (list.length === 0) {
          // Không tìm thấy → gợi ý tạo mới, pre-fill form
          setShowCreateCust(true)
          if (isPhoneLike(val)) {
            setNewCustPhone(val.trim())
            setNewCustName('')
          } else {
            setNewCustName(val.trim())
            setNewCustPhone('')
          }
        }
      } catch { setCustomerResults([]); setSearchDone(true) }
    }, 350)
  }

  const selectCustomer = (c) => {
    setCustomerId(c.id)
    setCustomerName(c.name)
    setCustomerSearch('')
    setCustomerResults([])
    setSearchDone(false)
    setShowCreateCust(false)
  }

  const clearCustomer = () => {
    setCustomerId(null)
    setCustomerName('')
    setCustomerSearch('')
    setCustomerResults([])
    setSearchDone(false)
    setShowCreateCust(false)
    setNewCustName('')
    setNewCustPhone('')
  }

  // Tạo KH mới → auto chọn
  const handleCreateCustomer = async () => {
    const name = newCustName.trim()
    const phone = newCustPhone.trim()
    if (!name) { toast.error('Vui lòng nhập tên khách hàng'); return }
    setCreatingCust(true)
    try {
      const created = await customerService.create({ name, phone: phone || null })
      toast.success(`✅ Đã tạo khách hàng "${created.name}"`)
      selectCustomer(created)
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.response?.data?.message || ''
      if (msg.toLowerCase().includes('phone') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('sđt')) {
        toast.error('SĐT này đã tồn tại trong hệ thống')
      } else {
        toast.error(msg || 'Lỗi tạo khách hàng')
      }
    } finally { setCreatingCust(false) }
  }

  const addItem = () => setItems(i => [...i, { productId: '', variantId: '', quantity: 1, discountPercent: 0 }])
  const removeItem = (idx) => setItems(i => i.filter((_, j) => j !== idx))
  const setItem = (idx, key, val) =>
    setItems(i => i.map((it, j) => j === idx ? { ...it, [key]: val } : it))

  const getProduct = (id) => products.find(p => String(p.id) === String(id))

  // [Sprint 0] Nhận cả product VÀ variant từ BarcodeScanner
  const handleScanResult = (product, variant) => {
    const variantId = variant?.id || null
    // Nếu cùng product+variant đã có trong giỏ → tăng qty
    const existing = items.find(i =>
      String(i.productId) === String(product.id) &&
      String(i.variantId || '') === String(variantId || '')
    )
    if (existing) {
      setItems(prev => prev.map(i =>
        String(i.productId) === String(product.id) &&
        String(i.variantId || '') === String(variantId || '')
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ))
    } else {
      const emptyIdx = items.findIndex(i => !i.productId)
      const newItem = { productId: String(product.id), variantId: variantId ? String(variantId) : '', quantity: 1, discountPercent: 0 }
      if (emptyIdx >= 0) {
        setItems(prev => prev.map((it, j) => j === emptyIdx ? newItem : it))
      } else {
        setItems(prev => [...prev, newItem])
      }
    }
  }

  const total = items.reduce((s, it) => {
    const p = getProduct(it.productId)
    if (!p) return s
    // [Sprint 0] Dùng giá từ variant nếu có
    const variants = p.variants || []
    const selectedVariant = variants.find(v => String(v.id) === String(it.variantId))
      || variants.find(v => v.isDefault)
    const price = selectedVariant ? Number(selectedVariant.sellPrice) : 0
    const disc = Number(it.discountPercent) || 0
    const actualPrice = price * (1 - disc / 100)
    return s + actualPrice * Number(it.quantity)
  }, 0)

  // Tính preview discount
  const selectedPromo = activePromos.find(p => String(p.id) === String(selectedPromoId))
  const previewDiscount = (() => {
    if (!selectedPromo || total <= 0) return 0
    if (total < Number(selectedPromo.minOrderValue)) return 0
    if (selectedPromo.type === 'PERCENT_DISCOUNT') {
      let disc = total * Number(selectedPromo.discountValue) / 100
      if (selectedPromo.maxDiscount) disc = Math.min(disc, Number(selectedPromo.maxDiscount))
      return Math.round(disc)
    }
    if (selectedPromo.type === 'FIXED_DISCOUNT') {
      return Math.min(Number(selectedPromo.discountValue), total)
    }
    return 0
  })()
  const finalTotal = total - previewDiscount

  // Issue 9: Validate stock trước khi submit
  const stockErrors = items.filter(it => {
    if (!it.productId) return false
    const p = getProduct(it.productId)
    if (!p) return false
    const variants = p.variants || []
    const sv = variants.find(v => String(v.id) === String(it.variantId)) || variants.find(v => v.isDefault)
    return sv && Number(it.quantity) > sv.stockQty
  })
  const hasStockError = stockErrors.length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (hasStockError) {
      const msgs = stockErrors.map(it => {
        const p = getProduct(it.productId)
        const sv = p?.variants?.find(v => String(v.id) === String(it.variantId)) || p?.variants?.find(v => v.isDefault)
        return `"${p?.name || ''}" chỉ còn ${sv?.stockQty || 0} ${sv?.sellUnit || ''}`
      })
      toast.error(`Không đủ hàng:\n${msgs.join('\n')}`, { duration: 5000 })
      return
    }
    const validItems = items.filter(i => i.productId)
    if (!validItems.length) return
    onSubmit({
      customerName: customerId ? undefined : (customerName || undefined),
      customerId: customerId || null,
      note,
      promotionId: selectedPromoId ? Number(selectedPromoId) : null,
      items: validItems.map(it => ({
        productId: Number(it.productId),
        quantity: Number(it.quantity),
        discountPercent: Number(it.discountPercent) || 0,
        variantId: it.variantId ? Number(it.variantId) : null,
      })),
    })
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* ── Customer picker + tạo mới inline ── */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">👤 Khách hàng</label>

            {customerId ? (
              /* Đã chọn / đã tạo KH */
              <div className="flex items-center gap-2 border-2 border-blue-300 rounded-lg px-3 py-2 bg-blue-50">
                <span className="text-blue-600">👤</span>
                <span className="flex-1 text-sm font-semibold text-blue-800">{customerName}</span>
                <button type="button" onClick={clearCustomer}
                  title="Đổi khách" className="text-gray-400 hover:text-red-500 text-xl leading-none">&times;</button>
              </div>
            ) : (
              <>
                {/* Search input */}
                <input
                  value={customerSearch}
                  onChange={e => handleCustomerSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc SĐT..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />

                {/* Dropdown kết quả tìm kiếm */}
                {customerResults.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                    {customerResults.map(c => (
                      <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm border-b last:border-0 flex items-center gap-2">
                        <span className="text-xs bg-blue-100 text-blue-700 font-mono px-1.5 py-0.5 rounded flex-shrink-0">{c.code}</span>
                        <span className="font-medium flex-1 min-w-0 truncate">{c.name}</span>
                        {c.phone && <span className="text-gray-400 text-xs flex-shrink-0">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Không tìm thấy → panel tạo mới */}
                {showCreateCust && (
                  <div className="mt-2 border-2 border-dashed border-blue-300 rounded-xl p-3 bg-blue-50 space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-blue-600 font-bold text-sm">➕</span>
                      <p className="text-xs font-semibold text-blue-700">
                        Không tìm thấy "<span className="italic">{customerSearch}</span>" — Tạo khách hàng mới?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-0.5">Tên KH <span className="text-red-500">*</span></label>
                        <input
                          value={newCustName}
                          onChange={e => setNewCustName(e.target.value)}
                          placeholder="Nguyễn Văn A"
                          className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateCustomer())}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-0.5">Số điện thoại</label>
                        <input
                          type="tel"
                          value={newCustPhone}
                          onChange={e => setNewCustPhone(e.target.value)}
                          placeholder="0901234567"
                          className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateCustomer())}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleCreateCustomer}
                        disabled={creatingCust || !newCustName.trim()}
                        className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
                        {creatingCust ? '⏳ Đang tạo...' : '✅ Tạo & chọn khách này'}
                      </button>
                      <button type="button"
                        onClick={() => { setShowCreateCust(false); setCustomerSearch('') }}
                        className="px-3 py-1.5 border rounded-lg text-xs text-gray-500 hover:bg-gray-100">
                        Bỏ qua
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 text-center">Bỏ qua để bán cho khách lẻ không cần lưu thông tin</p>
                  </div>
                )}

                {/* Gợi ý: chưa search thì cho nhập tên vãng lai */}
                {!customerSearch && !showCreateCust && (
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                    placeholder="...hoặc nhập tên khách vãng lai (không bắt buộc)"
                    className="w-full border border-dashed rounded-lg px-3 py-1.5 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-300 mt-1" />
                )}
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ghi chú (tùy chọn)" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">🎉 Chương trình khuyến mãi</label>
            <select value={selectedPromoId} onChange={e => setSelectedPromoId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">— Không áp dụng KM —</option>
              {activePromos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.type === 'PERCENT_DISCOUNT' ? ` (Giảm ${p.discountValue}%)` :
                   p.type === 'FIXED_DISCOUNT'   ? ` (Giảm ${Number(p.discountValue).toLocaleString('vi-VN')} ₫)` :
                   p.type === 'FREE_SHIPPING'     ? ' (Free ship)' :
                   p.type === 'BUY_X_GET_Y'       ? ' (Mua X tặng Y)' : ''}
                  {p.minOrderValue > 0 ? ` | Đơn từ ${Number(p.minOrderValue).toLocaleString('vi-VN')} ₫` : ''}
                </option>
              ))}
            </select>
            {selectedPromo?.type === 'BUY_X_GET_Y' && (
              <div className="text-xs text-amber-700 mt-1 bg-amber-50 rounded p-2 space-y-1">
                <p>🎁 <b>Mua X Tặng Y:</b> Mua {selectedPromo.buyQty ?? '?'} SP đủ điều kiện
                   → Tặng {selectedPromo.getQty ?? '?'} <b>{selectedPromo.getProductName || '...'}</b></p>
                <p className="text-gray-500">* Sản phẩm tặng sẽ được ghi nhận trong ghi chú đơn hàng</p>
              </div>
            )}
            {selectedPromo?.type === 'FREE_SHIPPING' && (
              <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded p-2">
                🚚 <b>Miễn phí vận chuyển</b> đã được áp dụng cho đơn hàng này
              </p>
            )}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-700">Chi tiết hóa đơn</h4>
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
            const variants = p?.variants || []
            const hasMultiVariant = variants.length > 1
            const selectedVariant = variants.find(v => String(v.id) === String(item.variantId))
              || variants.find(v => v.isDefault)
            const sellPrice = selectedVariant ? Number(selectedVariant.sellPrice) : 0
            const stockQty  = selectedVariant ? selectedVariant.stockQty : 0
            const sellUnit  = selectedVariant ? selectedVariant.sellUnit : (p?.sellUnit || p?.unit || '')
            const disc = Number(item.discountPercent) || 0
            const actualPrice = Math.round(sellPrice * (1 - disc / 100))
            const lineTotal = actualPrice * Number(item.quantity)
            const overStock = p && Number(item.quantity) > stockQty
            return (
              <div key={idx} className={`mb-2 p-3 rounded-lg border ${overStock ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                {/* Row 1: Sản phẩm + Biến thể */}
                <div className="flex gap-2 items-end flex-wrap mb-2">
                  <div className="flex-1 min-w-[180px]">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sản phẩm *</label>}
                    <select value={item.productId} onChange={e => {
                      const prod = products.find(pr => String(pr.id) === e.target.value)
                      const defVariant = prod?.variants?.find(v => v.isDefault) || prod?.variants?.[0]
                      setItem(idx, 'productId', e.target.value)
                      setItem(idx, 'variantId', defVariant?.id || '')
                    }}
                      required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                      <option value="">-- Chọn sản phẩm --</option>
                      {products.filter(prod => prod.active).map(prod => {
                        const dv = prod.variants?.find(v => v.isDefault) || prod.variants?.[0]
                        const stock = dv ? dv.stockQty : 0
                        return (
                          <option key={prod.id} value={prod.id} disabled={stock <= 0}>
                            {prod.code} - {prod.name}{stock <= 0 ? ' (Hết hàng)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  {p && hasMultiVariant && (
                    <div className="w-44">
                      {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Biến thể</label>}
                      <select value={item.variantId || ''} onChange={e => setItem(idx, 'variantId', e.target.value)}
                        className="w-full border border-purple-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.variantCode} — {Number(v.sellPrice).toLocaleString('vi-VN')}₫/{v.sellUnit} | Tồn: {v.stockQty}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <button type="button" onClick={() => removeItem(idx)}
                    className="text-red-400 hover:text-red-600 text-xl leading-none pb-1">&times;</button>
                </div>

                {/* Row 2: Giá bán + SL + CK + Thành tiền */}
                {p && (
                  <div className="flex gap-2 items-center flex-wrap">
                    {/* Giá niêm yết */}
                    <div className="bg-white border border-green-200 rounded-lg px-3 py-1.5 text-sm">
                      <span className="text-xs text-gray-400">Giá: </span>
                      <span className="font-bold text-green-700">{Number(sellPrice).toLocaleString('vi-VN')} ₫</span>
                      <span className="text-xs text-gray-400">/{sellUnit}</span>
                    </div>
                    {/* SL */}
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500 whitespace-nowrap">SL ({sellUnit}):</label>
                      <input type="text" inputMode="numeric" value={item.quantity}
                        onChange={e => { const r=e.target.value.replace(/\D/g,''); setItem(idx,'quantity',r||1) }}
                        className={`w-16 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 ${overStock ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'focus:ring-green-500'}`} />
                    </div>
                    {/* CK % */}
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-500">CK %:</label>
                      <input type="text" inputMode="decimal" value={item.discountPercent}
                        onChange={e => { const r=e.target.value.replace(/[^\d.]/g,''); setItem(idx,'discountPercent',r) }}
                        placeholder="0"
                        className="w-14 border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    </div>
                    {/* Thành tiền */}
                    <div className="ml-auto text-right">
                      {disc > 0 && (
                        <div className="text-xs text-gray-400 line-through">{(sellPrice * Number(item.quantity)).toLocaleString('vi-VN')} ₫</div>
                      )}
                      <div className={`font-bold text-sm ${disc > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                        {lineTotal.toLocaleString('vi-VN')} ₫
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning: quá tồn kho */}
                {overStock && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <span>⚠️</span>
                    <span>Chỉ còn <b>{stockQty} {sellUnit}</b> trong kho — vui lòng giảm số lượng</span>
                  </div>
                )}
              </div>
            )
          })}
          {/* Summary */}
          <div className="mt-3 bg-gray-50 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tổng tiền hàng:</span>
              <span>{total.toLocaleString('vi-VN')} ₫</span>
            </div>
            {previewDiscount > 0 && (
              <div className="flex justify-between text-amber-600 font-medium">
                <span>🎉 Giảm KM ({selectedPromo?.name}):</span>
                <span>-{previewDiscount.toLocaleString('vi-VN')} ₫</span>
              </div>
            )}
            {selectedPromo && total < Number(selectedPromo.minOrderValue) && (
              <p className="text-xs text-red-500">
                ⚠️ Đơn chưa đủ điều kiện (tối thiểu {Number(selectedPromo.minOrderValue).toLocaleString('vi-VN')} ₫)
              </p>
            )}
            {selectedPromo && total > 0 && total < Number(selectedPromo.minOrderValue) &&
              (Number(selectedPromo.minOrderValue) - total) / Number(selectedPromo.minOrderValue) <= 0.2 && (
              <div className="mt-1 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">🎯 Gần đủ điều kiện KM!</p>
                <p>Chỉ cần thêm <b className="text-amber-700">{(Number(selectedPromo.minOrderValue) - total).toLocaleString('vi-VN')} ₫</b> nữa để được{' '}
                  {selectedPromo.type === 'PERCENT_DISCOUNT' ? `giảm ${selectedPromo.discountValue}%` :
                   selectedPromo.type === 'FIXED_DISCOUNT' ? `giảm ${Number(selectedPromo.discountValue).toLocaleString('vi-VN')} ₫` : 'áp dụng KM'}.
                </p>
                <p className="text-amber-600 mt-0.5">💡 Hãy đề nghị khách thêm sản phẩm!</p>
              </div>
            )}
            {/* Nhắc nhở KM đang hoạt động nhưng chưa được chọn */}
            {!selectedPromoId && (() => {
              const nearPromos = activePromos.filter(p => {
                const min = Number(p.minOrderValue)
                if (min <= 0 || total <= 0) return false
                const gap = min - total
                return gap > 0 && gap / min <= 0.2
              })
              return nearPromos.length > 0 ? (
                <div className="mt-1 bg-blue-50 border border-blue-300 rounded-lg px-3 py-2 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">🎉 Gần đủ điều kiện nhận khuyến mãi:</p>
                  {nearPromos.map(p => (
                    <p key={p.id}>• <b>{p.name}</b>: thêm <b>{(Number(p.minOrderValue) - total).toLocaleString('vi-VN')} ₫</b> nữa</p>
                  ))}
                  <p className="text-blue-600">💡 Đề nghị khách thêm sản phẩm để được ưu đãi!</p>
                </div>
              ) : null
            })()}
            {selectedPromo?.appliesTo === 'PRODUCT' && selectedPromo.productIds?.length > 0 && (() => {
              const eligible = items.some(it => selectedPromo.productIds.includes(Number(it.productId)))
              return !eligible ? (
                <p className="text-xs text-red-500">
                  ⚠️ KM chỉ áp dụng cho: {selectedPromo.productNames?.join(', ')}. Hóa đơn chưa có SP nào phù hợp.
                </p>
              ) : null
            })()}
            {selectedPromo?.appliesTo === 'CATEGORY' && selectedPromo.categoryIds?.length > 0 && (() => {
              const itemCatIds = items
                .map(it => products.find(p => String(p.id) === String(it.productId))?.categoryId)
                .filter(Boolean)
              const eligible = itemCatIds.some(cid => selectedPromo.categoryIds.includes(cid))
              return !eligible ? (
                <p className="text-xs text-red-500">
                  ⚠️ KM chỉ áp dụng cho danh mục: {selectedPromo.categoryNames?.join(', ')}. Chưa có SP nào thuộc danh mục này.
                </p>
              ) : null
            })()}
            <div className="flex justify-between font-bold text-green-700 text-base border-t pt-1.5">
              <span>Khách thanh toán:</span>
              <span>{finalTotal.toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {hasStockError && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">
              ⚠️ Có sản phẩm vượt quá số lượng tồn kho. Vui lòng điều chỉnh lại.
            </div>
          )}
          <button type="submit" disabled={loading || hasStockError}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition ${hasStockError ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'} disabled:opacity-60`}>
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
          {inv.promotionName && (
            <div className="col-span-2">
              <span className="text-gray-500">🎉 Khuyến mãi:</span>{' '}
              <span className="text-amber-600 font-semibold">{inv.promotionName}</span>
            </div>
          )}
        </div>
        <table className="w-full border rounded-lg overflow-hidden mt-3">
          <thead className="bg-gray-50">
            <tr className="text-gray-600 text-xs">
              <th className="text-left px-3 py-2">Sản phẩm</th>
              <th className="text-right px-3 py-2">SL</th>
              <th className="text-right px-3 py-2" title="Giá niêm yết bán cho khách (variant.sellPrice tại thời điểm bán)">
                Giá niêm yết
              </th>
              <th className="text-right px-3 py-2">CK%</th>
              <th className="text-right px-3 py-2" title="Giá thực tế sau chiết khấu dòng">Giá bán</th>
              <th className="text-right px-3 py-2 text-orange-600" title="Giá vốn trung bình FEFO từ lô hàng (unitCostSnapshot)">
                Giá vốn
              </th>
              <th className="text-right px-3 py-2">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {inv.items?.map((it, i) => {
              const disc = Number(it.lineDiscountPercent || 0)
              const cost = Number(it.unitCostSnapshot || 0)
              const sellPrice = Number(it.unitPrice || 0)
              const margin = sellPrice > 0 ? Math.round((sellPrice - cost) / sellPrice * 100) : 0
              return (
              <tr key={i} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2">
                  {it.productName}
                  {it.variantCode && it.variantCode !== it.productCode && (
                    <span className="ml-1 text-xs text-purple-600 font-mono">[{it.variantCode}]</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs">{it.quantity} {it.sellUnit || it.unit}</td>
                <td className="px-3 py-2 text-right text-xs text-gray-500">
                  {Number(it.originalUnitPrice ?? it.unitPrice).toLocaleString('vi-VN')}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {disc > 0
                    ? <span className="text-amber-600 font-medium">{disc}%</span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right text-xs font-medium">{Number(it.unitPrice).toLocaleString('vi-VN')}</td>
                <td className="px-3 py-2 text-right text-xs text-orange-700">
                  <div>{cost.toLocaleString('vi-VN')}</div>
                  <div className="text-gray-400 text-[10px]">biên {margin}%</div>
                </td>
                <td className="px-3 py-2 text-right font-medium">{Number(it.lineTotal).toLocaleString('vi-VN')}</td>
              </tr>
            )})}
          </tbody>
          <tfoot className="bg-gray-50 text-sm font-semibold">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-gray-600">Tổng tiền hàng:</td>
              <td className="px-3 py-2 text-right text-gray-700">{Number(inv.totalAmount).toLocaleString('vi-VN')} ₫</td>
            </tr>
            {Number(inv.discountAmount) > 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-amber-600">🎉 Giảm KM:</td>
                <td className="px-3 py-2 text-right text-amber-600 font-bold">-{Number(inv.discountAmount).toLocaleString('vi-VN')} ₫</td>
              </tr>
            )}
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-green-700 font-bold text-base">Khách thanh toán:</td>
              <td className="px-3 py-2 text-right text-green-700 font-bold text-base">
                {Number(inv.finalAmount ?? inv.totalAmount).toLocaleString('vi-VN')} ₫
              </td>
            </tr>
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-blue-600">Lợi nhuận gộp:</td>
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

// ── CancelModal — Hủy hóa đơn với lý do ─────────────────────────────────────
function CancelModal({ invoice, onClose, onConfirm, saving }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-bold text-gray-800">🚫 Hủy hóa đơn</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono text-red-500">{invoice.invoiceNo}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Thông tin HĐ */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Khách hàng:</span>
              <span className="font-medium">{invoice.customerName || 'Khách lẻ'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ngày bán:</span>
              <span>{dayjs(invoice.invoiceDate).format('DD/MM/YYYY HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tổng tiền:</span>
              <span className="font-bold text-green-700">{Number(invoice.totalAmount).toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>

          {/* Lý do hủy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lý do hủy <span className="text-gray-400 font-normal">(tùy chọn)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="VD: Khách đổi ý, nhập sai sản phẩm, khách hủy đơn..."
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              autoFocus
            />
          </div>

          {/* Cảnh báo */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700 space-y-1">
            <p>⚠️ <b>Lưu ý khi hủy hóa đơn:</b></p>
            <p>• Tồn kho sẽ được hoàn lại tự động</p>
            <p>• Hóa đơn vẫn còn trong lịch sử với trạng thái "Đã hủy"</p>
            <p>• Không ảnh hưởng báo cáo (doanh thu đã hủy không được tính)</p>
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium">
            Quay lại
          </button>
          <button onClick={() => onConfirm(reason)} disabled={saving}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
            {saving ? '⏳ Đang hủy...' : '🚫 Xác nhận hủy hóa đơn'}
          </button>
        </div>
      </div>
    </div>
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
  const [cancelTarget, setCancelTarget] = useState(null)  // HĐ đang chờ xác nhận hủy
  const [activeTab, setActiveTab] = useState('invoices')

  const { data, isLoading } = useInvoices(page, from || undefined, to || undefined)
  const { data: products = [] } = useProducts()
  const { create, cancel, remove } = useInvoiceMutations()
  const { data: pendingOrders = [] } = usePendingOrders()

  const invoices = data?.content || []
  const totalPages = data?.totalPages || 1
  const { sorted: sortedInvoices, SortHeader } = useSort(invoices, 'invoiceDate', 'desc')
  const pendingCount = pendingOrders.filter(o => o.status === 'PENDING').length

  const handleCreate = async (formData) => {
    try {
      const inv = await create.mutateAsync(formData)
      setShowModal(false)
      setNewInvoice(inv)
    } catch (e) {
      const data = e?.response?.data
      const msg = data?.detail || data?.message || data?.error || e?.message || ''
      const status = e?.response?.status
      if (status === 409 || msg.toLowerCase().includes('stock') || msg.toLowerCase().includes('tồn') || msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('not enough')) {
        toast.error(`❌ Không đủ hàng trong kho!\n${msg || 'Vui lòng kiểm tra lại số lượng.'}`, { duration: 5000 })
      } else if (status === 400) {
        toast.error(`❌ Lỗi dữ liệu: ${msg || 'Vui lòng kiểm tra lại thông tin hóa đơn'}`, { duration: 4000 })
      } else if (status === 403) {
        toast.error('❌ Bạn không có quyền tạo hóa đơn', { duration: 4000 })
      } else {
        toast.error(`❌ ${msg || 'Lỗi tạo hóa đơn — vui lòng thử lại'}`, { duration: 4000 })
      }
    }
  }

  const handleDeleteInvoice = async (inv) => {
    const isToday = dayjs(inv.invoiceDate).isSame(dayjs(), 'day')
    if (!isToday) {
      toast.error(
        `❌ Không thể xóa hóa đơn ${inv.invoiceNo}\n` +
        `Hóa đơn ngày ${dayjs(inv.invoiceDate).format('DD/MM/YYYY')} — chỉ xóa được hóa đơn trong ngày.\n` +
        `Dùng chức năng "Hủy hóa đơn" thay thế.`,
        { duration: 6000 }
      )
      return
    }
    if (!window.confirm(
      `Xóa hóa đơn ${inv.invoiceNo}?\n\n` +
      `• Khách: ${inv.customerName || 'Khách lẻ'}\n` +
      `• Tổng tiền: ${Number(inv.totalAmount).toLocaleString('vi-VN')} ₫\n\n` +
      `Tồn kho sẽ được hoàn lại. Hành động này không thể hoàn tác!`
    )) return
    try {
      await remove.mutateAsync(inv.id)
      toast.success(`✅ Đã xóa hóa đơn ${inv.invoiceNo}`)
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.response?.data?.message || e?.message || ''
      toast.error(`❌ ${msg || 'Lỗi khi xóa hóa đơn'}`, { duration: 5000 })
    }
  }

  const handleCancelConfirm = async (reason) => {
    if (!cancelTarget) return
    try {
      await cancel.mutateAsync({ id: cancelTarget.id, reason })
      setCancelTarget(null)
    } catch { /* handled by hook */ }
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <AdminPageHeader
        title="Hóa Đơn Bán Hàng"
        actions={activeTab === 'invoices' ? (
          <button onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
            + Tạo hóa đơn bán
          </button>
        ) : null}
      />

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${activeTab==='invoices' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          📄 Hóa đơn đã bán
        </button>
        <button onClick={() => setActiveTab('pending')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${activeTab==='pending' ? 'border-yellow-500 text-yellow-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          ⏳ Đơn chờ thanh toán
          {pendingCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 animate-pulse">{pendingCount}</span>}
        </button>
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'pending' ? <PendingOrdersTab /> : (
        <AdminCard>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0) }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0) }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {(from || to) && (
              <div className="flex items-end">
                <button onClick={() => { setFrom(''); setTo('') }}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm border rounded-lg">✕ Xóa lọc</button>
              </div>
            )}
          </div>

          {/* Table / Cards */}
          <AdminTable
            loading={isLoading}
            rows={sortedInvoices}
            emptyText="Chưa có hóa đơn nào"
            columns={[
              { key: 'invoiceNo', label: 'Số HĐ', tdClassName: 'font-mono text-blue-600 cursor-pointer hover:underline',
                render: inv => (
                  <span onClick={() => setDetail(inv)} className="flex items-center gap-1.5">
                    {inv.invoiceNo}
                    {inv.status === 'CANCELLED' && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">Đã hủy</span>
                    )}
                  </span>
                )},
              { key: 'customerName', label: 'Khách hàng',
                render: inv => inv.customerName || '—' },
              { key: 'invoiceDate', label: 'Ngày bán',
                render: inv => dayjs(inv.invoiceDate).format('DD/MM/YYYY HH:mm') },
              { key: 'totalAmount', label: 'Tổng tiền', thClassName: 'text-right',
                tdClassName: inv => `text-right font-medium ${inv?.status === 'CANCELLED' ? 'line-through text-gray-400' : 'text-green-700'}`,
                render: inv => Number(inv.totalAmount).toLocaleString('vi-VN') + ' ₫' },
              { key: 'totalProfit', label: 'Lợi nhuận', thClassName: 'text-right',
                tdClassName: inv => `text-right ${inv?.status === 'CANCELLED' ? 'text-gray-400' : 'text-blue-600'}`,
                render: inv => inv.status === 'CANCELLED' ? '—' : Number(inv.totalProfit).toLocaleString('vi-VN') + ' ₫' },
              { key: 'actions', label: 'Thao tác', isAction: true, thClassName: 'text-center', tdClassName: 'text-center whitespace-nowrap',
                render: inv => inv.status === 'CANCELLED' ? (
                  <span className="text-xs text-gray-400 italic">
                    Đã hủy {inv.cancelledAt ? dayjs(inv.cancelledAt).format('DD/MM') : ''}
                  </span>
                ) : (
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => printInvoice(inv)} className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded hover:bg-blue-50">🖨️ In</button>
                    <button onClick={() => setDetail(inv)} className="text-gray-600 hover:text-gray-800 text-xs px-2 py-1 rounded hover:bg-gray-100">👁️ Xem</button>
                    <button onClick={() => setCancelTarget(inv)} className="text-orange-600 hover:text-orange-800 text-xs px-2 py-1 rounded hover:bg-orange-50">🚫 Hủy</button>
                    <button onClick={() => handleDeleteInvoice(inv)} className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">🗑️ Xóa</button>
                  </div>
                )},
            ]}
            mobileCard={inv => (
              <div className={inv.status === 'CANCELLED' ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <button onClick={() => setDetail(inv)}
                      className="font-mono text-blue-600 font-bold text-sm hover:underline">{inv.invoiceNo}</button>
                    {inv.status === 'CANCELLED' && (
                      <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Đã hủy</span>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">{dayjs(inv.invoiceDate).format('DD/MM/YYYY HH:mm')}</p>
                  </div>
                  <span className={`text-base font-bold ${inv.status === 'CANCELLED' ? 'line-through text-gray-400' : 'text-green-700'}`}>
                    {Number(inv.totalAmount).toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs mb-3">
                  <span className="text-gray-600">👤 {inv.customerName || 'Khách lẻ'}</span>
                  {inv.status !== 'CANCELLED' && (
                    <span className="text-blue-600">LN: {Number(inv.totalProfit).toLocaleString('vi-VN')} ₫</span>
                  )}
                  {inv.cancelReason && (
                    <span className="text-red-500 italic">"{inv.cancelReason}"</span>
                  )}
                </div>
                {inv.status === 'CANCELLED' ? (
                  <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                    🚫 Hủy bởi {inv.cancelledBy} · {inv.cancelledAt ? dayjs(inv.cancelledAt).format('DD/MM/YYYY HH:mm') : ''}
                  </p>
                ) : (
                  <div className="flex gap-1.5 pt-2 border-t border-gray-100">
                    <button onClick={() => printInvoice(inv)}
                      className="flex-1 text-center text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 py-1.5 rounded-lg font-medium">🖨️ In</button>
                    <button onClick={() => setDetail(inv)}
                      className="flex-1 text-center text-xs bg-gray-50 text-gray-700 hover:bg-gray-100 py-1.5 rounded-lg font-medium">👁️ Xem</button>
                    <button onClick={() => setCancelTarget(inv)}
                      className="flex-1 text-center text-xs bg-orange-50 text-orange-600 hover:bg-orange-100 py-1.5 rounded-lg font-medium">🚫 Hủy</button>
                    <button onClick={() => handleDeleteInvoice(inv)}
                      className="flex-1 text-center text-xs bg-red-50 text-red-600 hover:bg-red-100 py-1.5 rounded-lg font-medium">🗑️ Xóa</button>
                  </div>
                )}
              </div>
            )}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between pt-3 border-t mt-3">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">← Trước</button>
            <span className="text-sm text-gray-500">Trang {page+1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page>=totalPages-1}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">Sau →</button>
          </div>
        </AdminCard>
      )}

      {showModal && (
        <Modal title="Tạo hóa đơn bán hàng" onClose={() => setShowModal(false)}>
          <InvoiceForm
            products={products}
            onSubmit={handleCreate}
            loading={create.isLoading}
          />
        </Modal>
      )}

      {detail && <InvoiceDetail inv={detail} onClose={() => setDetail(null)} />}

      {/* Cancel Modal */}
      {cancelTarget && (
        <CancelModal
          invoice={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm}
          saving={cancel.isLoading}
        />
      )}

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
