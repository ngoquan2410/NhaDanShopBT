﻿import { useState, useRef } from 'react'
import { useReceipts, useReceiptMutations } from '../../hooks/useReceipts'
import { useProducts, useVariants } from '../../hooks/useProducts'
import { useSort } from '../../hooks/useSort'
import { receiptService } from '../../services/receiptService'
import { comboService } from '../../services/comboService'
import { supplierService } from '../../services/supplierService'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import BarcodeLabelPrinter from '../../components/BarcodeLabelPrinter'
import { AdminTable, AdminPageHeader, AdminCard } from '../../components/admin/AdminTable'

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

// ── VariantReceiptRow: 1 dòng nhập hàng với dropdown variant + piecesOverride ──
function VariantReceiptRow({ idx, item, products, onSet, onRemove }) {
  const product   = products.find(pr => String(pr.id) === String(item.productId))
  // Lấy variants của SP đang chọn
  const { data: variants = [] } = useVariants(product?.id)
  const hasMultiVariant = variants.length > 1

  // Khi chọn SP → auto chọn default variant, pre-fill importUnit + piecesOverride
  const handleProductChange = (productId) => {
    onSet(idx, 'productId', productId)
    onSet(idx, 'variantId', '')
    onSet(idx, 'importUnit', '')
    onSet(idx, 'piecesOverride', '')
  }

  // Khi chọn variant → pre-fill importUnit và piecesOverride từ variant
  const handleVariantChange = (variantId) => {
    const v = variants.find(v => String(v.id) === String(variantId))
    onSet(idx, 'variantId', variantId)
    if (v) {
      onSet(idx, 'importUnit', v.importUnit || '')
      onSet(idx, 'piecesOverride', v.piecesPerUnit > 1 ? String(v.piecesPerUnit) : '')
    }
  }

  // Resolve variant hiện tại để hiển thị thông tin
  const selectedVariant = variants.find(v => String(v.id) === String(item.variantId))
    || variants.find(v => v.isDefault)

  // Live preview: số bịch sẽ nhập + giá vốn/bịch
  const qty        = Number(item.quantity) || 0
  const unitCost   = Number(item.unitCost) || 0
  const pieces     = Number(item.piecesOverride) || selectedVariant?.piecesPerUnit || 1
  const importUnit = item.importUnit || selectedVariant?.importUnit || ''
  const sellUnit   = selectedVariant?.sellUnit || 'cái'
  const isGop      = pieces > 1
  const retailQty  = qty * pieces
  const costPerRetail = isGop && unitCost > 0 ? (unitCost / pieces) : unitCost
  const disc       = Number(item.discountPercent) || 0
  const afterDisc  = qty * unitCost * (1 - disc / 100)

  return (
    <div className="border border-gray-100 rounded-xl p-3 mb-3 bg-gray-50 space-y-2">
      {/* Row 1: SP + Variant */}
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sản phẩm *</label>}
          <select value={item.productId} onChange={e => handleProductChange(e.target.value)}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">-- Chọn sản phẩm --</option>
            {products.filter(pr => pr.productType !== 'COMBO').map(pr => (
              <option key={pr.id} value={pr.id}>{pr.code} — {pr.name}</option>
            ))}
          </select>
        </div>
        {/* Variant dropdown — hiện khi có nhiều variant */}
        {product && hasMultiVariant && (
          <div className="w-48">
            {idx === 0 && <label className="block text-xs text-purple-600 mb-1 font-medium">📦 Biến thể *</label>}
            <select value={item.variantId || ''}
              onChange={e => handleVariantChange(e.target.value)}
              className="w-full border-2 border-purple-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-purple-50">
              <option value="">-- Chọn biến thể --</option>
              {variants.map(v => (
                <option key={v.id} value={v.id}>
                  {v.variantCode} ({v.sellUnit}){v.isDefault ? ' ⭐' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Nếu chỉ có 1 variant: hiện badge */}
        {product && !hasMultiVariant && selectedVariant && (
          <div className="pb-1">
            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
              {selectedVariant.sellUnit}
            </span>
          </div>
        )}
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 pb-1 text-xl leading-none">×</button>
      </div>

      {/* Row 2: Số lượng + Giá + CK + ĐV nhập + Số bịch/ĐV + HSD */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Số lượng <span className="text-gray-400">({importUnit || 'ĐV'})</span>
          </label>
          <input type="text" inputMode="numeric" value={item.quantity}
            onChange={e => { const r=e.target.value.replace(/\D/g,''); onSet(idx,'quantity',r) }}
            onBlur={e => { if(e.target.value==='' || Number(e.target.value)<1) onSet(idx,'quantity',1) }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Đơn giá (₫/{importUnit || 'ĐV'})
          </label>
          <input type="text" inputMode="numeric"
            value={item.unitCost === 0 || item.unitCost === '' ? '' : Number(item.unitCost).toLocaleString('vi-VN')}
            placeholder="0"
            onChange={e => {
              const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
              if (raw === '' || /^\d+$/.test(raw)) onSet(idx, 'unitCost', raw === '' ? 0 : Number(raw))
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Chiết khấu %</label>
          <input type="text" inputMode="decimal" value={item.discountPercent}
            onChange={e => { const r=e.target.value.replace(/[^\d.]/g,''); onSet(idx,'discountPercent',r) }}
            placeholder="0"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">ĐV nhập kho</label>
          <input value={item.importUnit || importUnit}
            onChange={e => onSet(idx, 'importUnit', e.target.value)}
            placeholder="kg, thùng..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs text-blue-600 mb-1 font-medium">
            {sellUnit}/{importUnit || 'ĐV'}
          </label>
          <input type="text" inputMode="numeric" value={item.piecesOverride}
            onChange={e => { const r=e.target.value.replace(/\D/g,''); onSet(idx,'piecesOverride',r) }}
            placeholder={String(selectedVariant?.piecesPerUnit || 1)}
            className="w-full border-2 border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hạn sử dụng</label>
          <input type="date" value={item.expiryDateOverride || ''}
            onChange={e => onSet(idx, 'expiryDateOverride', e.target.value || null)}
            className="w-full border rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
      </div>

      {/* Live preview */}
      {product && qty > 0 && unitCost > 0 && (
        <div className={`rounded-lg px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1 bg-green-50 border border-green-200 text-green-800`}>
          <span>
            {qty} {importUnit || 'ĐV'} × {pieces} {sellUnit} = <b>{retailQty} {sellUnit}</b> vào kho
          </span>
          <span>
            Giá vốn/<b>{sellUnit}</b>: <b className="text-green-700">{Math.round(costPerRetail).toLocaleString('vi-VN')} ₫</b>
          </span>
          {disc > 0 && (
            <span className="text-amber-700">
              Sau CK {disc}%: {Math.round(afterDisc).toLocaleString('vi-VN')} ₫
            </span>
          )}
          {selectedVariant && (
            <span className="text-gray-500">
              Tồn hiện tại: {selectedVariant.stockQty} {sellUnit}
            </span>
          )}
        </div>
      )}
      {/* Warning khi chưa chọn variant (multi-variant product) */}
      {product && hasMultiVariant && !item.variantId && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
          ⚠️ Vui lòng chọn biến thể — SP này có {variants.length} biến thể (VD: 200g / 500g)
        </p>
      )}
    </div>
  )
}

function ReceiptForm({ products, onSubmit, loading }) {
  const today = new Date().toISOString().split('T')[0]   // 'yyyy-MM-dd'
  const [receiptDate, setReceiptDate] = useState(today)  // mặc định = hôm nay
  const [supplierName, setSupplierName] = useState('')
  const [supplierId, setSupplierId] = useState(null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierResults, setSupplierResults] = useState([])
  const [searchDone, setSearchDone] = useState(false)
  // Inline tạo mới NCC
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [newSupplierAddress, setNewSupplierAddress] = useState('')
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const supplierSearchTimer = useRef(null)

  const [note, setNote] = useState('')
  const [shippingFee, setShippingFee] = useState(0)
  const [vatPercent, setVatPercent] = useState(0)
  const [items, setItems] = useState([{
    productId: '', variantId: '', quantity: 1, unitCost: 0,
    discountPercent: 0, piecesOverride: '', importUnit: '', expiryDateOverride: null
  }])
  const [comboItems, setComboItems] = useState([])

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierService.getAll(),
    staleTime: 60_000,
  })
  const queryClient = useQueryClient()
  const handleSupplierSearch = (val) => {
    setSupplierSearch(val)
    setSearchDone(false)
    setShowCreateSupplier(false)
    setSupplierResults([])
    if (!val.trim()) return
    clearTimeout(supplierSearchTimer.current)
    supplierSearchTimer.current = setTimeout(async () => {
      try {
        const res = await supplierService.getAll(val.trim())
        const list = Array.isArray(res) ? res : (res.content || [])
        setSupplierResults(list.slice(0, 6))
        setSearchDone(true)
        if (list.length === 0) {
          setShowCreateSupplier(true)
          setNewSupplierName(val.trim())
          setNewSupplierPhone('')
          setNewSupplierAddress('')
        }
      } catch { setSupplierResults([]); setSearchDone(true) }
    }, 350)
  }

  const selectSupplier = (s) => {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierSearch('')
    setSupplierResults([])
    setSearchDone(false)
    setShowCreateSupplier(false)
  }

  const clearSupplier = () => {
    setSupplierId(null)
    setSupplierName('')
    setSupplierSearch('')
    setSupplierResults([])
    setSearchDone(false)
    setShowCreateSupplier(false)
    setNewSupplierName('')
    setNewSupplierPhone('')
    setNewSupplierAddress('')
  }

  const handleCreateSupplier = async () => {
    const name = newSupplierName.trim()
    if (!name) { toast.error('Vui lòng nhập tên nhà cung cấp'); return }
    setCreatingSupplier(true)
    try {
      const created = await supplierService.create({
        name,
        phone: newSupplierPhone.trim() || null,
        address: newSupplierAddress.trim() || null,
      })
      toast.success(`✅ Đã tạo NCC "${created.name}"`)
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      selectSupplier(created)
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.response?.data?.detail || 'Lỗi tạo nhà cung cấp')
    } finally { setCreatingSupplier(false) }
  }

  const { data: combos = [] } = useQuery({
    queryKey: ['combos'],
    queryFn:  comboService.getAll,
    staleTime: 60_000,
  })
  const activeCombos = combos.filter(c => c.active)

  const addItem = () => setItems(i => [...i, {
    productId: '', variantId: '', quantity: 1, unitCost: 0,
    discountPercent: 0, piecesOverride: '', importUnit: '', expiryDateOverride: null
  }])
  const removeItem = (idx) => setItems(i => i.filter((_, j) => j !== idx))
  const setItem = (idx, key, val) =>
    setItems(i => i.map((it, j) => j === idx ? { ...it, [key]: val } : it))

  const addComboItem    = () => setComboItems(c => [...c, { comboId: '', quantity: 1, unitCost: 0, discountPercent: 0 }])
  const removeComboItem = (idx) => setComboItems(c => c.filter((_, j) => j !== idx))
  const setComboItem    = (idx, key, val) =>
    setComboItems(c => c.map((it, j) => j === idx ? { ...it, [key]: val } : it))

  const handleSubmit = (e) => {
    e.preventDefault()
    const validItems  = items.filter(it => it.productId)
    const validCombos = comboItems.filter(it => it.comboId)
    if (validItems.length === 0 && validCombos.length === 0) {
      toast.error('Phiếu nhập phải có ít nhất 1 sản phẩm hoặc combo'); return
    }
    onSubmit({
      supplierName, supplierId: supplierId || null, note,
      shippingFee:  Number(shippingFee),
      vatPercent:   Number(vatPercent) || 0,
      receiptDate:  receiptDate || null,
      items: validItems.map(it => ({
        productId:          Number(it.productId),
        quantity:           Number(it.quantity),
        unitCost:           Number(it.unitCost),
        discountPercent:    Number(it.discountPercent) || 0,
        variantId:          it.variantId ? Number(it.variantId) : null,
        importUnit:         it.importUnit || null,
        piecesOverride:     it.piecesOverride ? Number(it.piecesOverride) : null,
        expiryDateOverride: it.expiryDateOverride || null,
      })),
      comboItems: validCombos.map(it => ({
        comboId:         Number(it.comboId),
        quantity:        Number(it.quantity),
        unitCost:        Number(it.unitCost),
        discountPercent: Number(it.discountPercent) || 0,
      })),
    })
  }

  // Tổng tiền gốc trước chiết khấu (SP đơn + combo)
  const subtotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitCost), 0)
               + comboItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unitCost), 0)
  // Tổng sau chiết khấu từng dòng
  const totalAfterDiscount = items.reduce((s, it) => {
    const disc = Number(it.discountPercent) || 0
    return s + Number(it.quantity) * Number(it.unitCost) * (1 - disc / 100)
  }, 0) + comboItems.reduce((s, it) => {
    const disc = Number(it.discountPercent) || 0
    return s + Number(it.quantity) * Number(it.unitCost) * (1 - disc / 100)
  }, 0)
  // VAT toàn đơn tính trên tổng sau chiết khấu
  const totalVat = totalAfterDiscount * (Number(vatPercent) || 0) / 100
  const grandTotal = totalAfterDiscount + Number(shippingFee) + totalVat

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* ── Supplier picker + tạo mới inline ── */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">🏭 Nhà cung cấp</label>
          {supplierId ? (
            <div className="flex items-center gap-2 border-2 border-green-300 rounded-lg px-3 py-2 bg-green-50">
              <span className="text-green-600">🏭</span>
              <span className="flex-1 text-sm font-semibold text-green-800">{supplierName}</span>
              <button type="button" onClick={clearSupplier}
                title="Đổi NCC" className="text-gray-400 hover:text-red-500 text-xl leading-none">&times;</button>
            </div>
          ) : (
            <>
              <input
                value={supplierSearch}
                onChange={e => handleSupplierSearch(e.target.value)}
                placeholder="Tìm theo tên nhà cung cấp..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              {/* Dropdown kết quả */}
              {supplierResults.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                  {supplierResults.map(s => (
                    <button key={s.id} type="button" onClick={() => selectSupplier(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-green-50 text-sm border-b last:border-0 flex items-center gap-2">
                      <span className="text-xs bg-green-100 text-green-700 font-mono px-1.5 py-0.5 rounded flex-shrink-0">{s.code}</span>
                      <span className="font-medium flex-1 min-w-0 truncate">{s.name}</span>
                      {s.phone && <span className="text-gray-400 text-xs flex-shrink-0">{s.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Không tìm thấy → panel tạo mới */}
              {showCreateSupplier && (
                <div className="mt-2 border-2 border-dashed border-green-300 rounded-xl p-3 bg-green-50 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-600 font-bold text-sm">➕</span>
                    <p className="text-xs font-semibold text-green-700">
                      Không tìm thấy "<span className="italic">{supplierSearch}</span>" — Tạo nhà cung cấp mới?
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-600 mb-0.5">Tên NCC <span className="text-red-500">*</span></label>
                      <input
                        value={newSupplierName}
                        onChange={e => setNewSupplierName(e.target.value)}
                        placeholder="Công ty TNHH..."
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Số điện thoại</label>
                      <input
                        type="tel"
                        value={newSupplierPhone}
                        onChange={e => setNewSupplierPhone(e.target.value)}
                        placeholder="0901234567"
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">Địa chỉ</label>
                      <input
                        value={newSupplierAddress}
                        onChange={e => setNewSupplierAddress(e.target.value)}
                        placeholder="Địa chỉ (tùy chọn)"
                        className="w-full border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCreateSupplier}
                      disabled={creatingSupplier || !newSupplierName.trim()}
                      className="flex-1 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                      {creatingSupplier ? '⏳ Đang tạo...' : '✅ Tạo & chọn NCC này'}
                    </button>
                    <button type="button"
                      onClick={() => { setShowCreateSupplier(false); setSupplierSearch('') }}
                      className="px-3 py-1.5 border rounded-lg text-xs text-gray-500 hover:bg-gray-100">
                      Bỏ qua
                    </button>
                  </div>
                </div>
              )}
              {/* Chưa search → cho nhập tay */}
              {!supplierSearch && !showCreateSupplier && (
                <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
                  placeholder="...hoặc nhập tên NCC thủ công (không bắt buộc)"
                  className="w-full border border-dashed rounded-lg px-3 py-1.5 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-green-300 mt-1" />
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
        {/* ── Ngày nhập kho ── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            📅 Ngày nhập kho
            <span className="ml-1 text-xs text-gray-400 font-normal">— mặc định hôm nay</span>
          </label>
          <input type="date" value={receiptDate} max={today}
            onChange={e => setReceiptDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          {receiptDate && receiptDate < today && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠️ Nhập ngày trong quá khứ — nhớ điền Ngày HSD thực tế ở từng dòng để FEFO chính xác
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🚚 Phí vận chuyển (₫)
            <span className="ml-1 text-xs text-gray-400 font-normal">— chia đều vào giá vốn</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={shippingFee === 0 || shippingFee === '' ? '' : Number(shippingFee).toLocaleString('vi-VN')}
            placeholder="0"
            onChange={e => {
              const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
              if (raw === '' || /^\d+$/.test(raw)) setShippingFee(raw === '' ? 0 : Number(raw))
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🧾 Thuế GTGT — VAT % <span className="text-xs text-gray-400 font-normal">(cho toàn đơn, tính trên tổng sau CK)</span>
          </label>
          <input type="text" inputMode="decimal" value={vatPercent}
            onChange={e => { const r=e.target.value.replace(/[^\d.]/g,''); setVatPercent(r) }}
            onBlur={() => { const n=parseFloat(vatPercent); setVatPercent(isNaN(n)||n<0?0:n>100?100:n) }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="0" />
          {Number(vatPercent) > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              💡 Tổng VAT: {totalVat.toLocaleString('vi-VN')} ₫ — phân bổ đều vào giá vốn từng SP theo tỷ lệ
            </p>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-700">Chi tiết nhập hàng</h4>
          <button type="button" onClick={addItem}
            className="text-green-600 hover:text-green-700 text-sm font-medium">+ Thêm dòng</button>
        </div>
        {items.map((item, idx) => (
          <VariantReceiptRow
            key={idx}
            idx={idx}
            item={item}
            products={products}
            onSet={setItem}
            onRemove={() => removeItem(idx)}
          />
        ))}

        {/* Summary */}
        <div className="mt-4 bg-green-50 rounded-lg p-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Tổng tiền gốc:</span>
            <span>{subtotal.toLocaleString('vi-VN')} ₫</span>
          </div>
          {totalAfterDiscount < subtotal && (
            <div className="flex justify-between text-green-700">
              <span>Sau chiết khấu:</span>
              <span>-{(subtotal - totalAfterDiscount).toLocaleString('vi-VN')} ₫</span>
            </div>
          )}
          {Number(shippingFee) > 0 && (
            <div className="flex justify-between text-blue-600">
              <span>Phí vận chuyển:</span>
              <span>+{Number(shippingFee).toLocaleString('vi-VN')} ₫</span>
            </div>
          )}
          {totalVat > 0 && (
            <div className="flex justify-between text-purple-600">
              <span>Thuế GTGT (VAT):</span>
              <span>+{Math.round(totalVat).toLocaleString('vi-VN')} ₫</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-green-800 border-t pt-1.5 text-base">
            <span>Tổng thực trả:</span>
            <span>{grandTotal.toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>
      </div>

      {/* ── Section nhập Combo ── */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="font-semibold text-gray-700">📦 Nhập theo Combo <span className="text-xs text-gray-400 font-normal">(tuỳ chọn)</span></h4>
          </div>
          {activeCombos.length > 0 && (
            <button type="button" onClick={addComboItem}
              className="text-purple-600 hover:text-purple-700 text-sm font-medium">+ Thêm combo</button>
          )}
        </div>

        {activeCombos.length === 0 && (
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border border-dashed">
            Chưa có combo nào hoạt động. Hãy tạo combo trong tab <strong>Quản lý Combo</strong> trước.
          </div>
        )}

        {comboItems.map((ci, idx) => {
          const selectedCombo = activeCombos.find(c => String(c.id) === String(ci.comboId))
          const afterDisc = Number(ci.quantity) * Number(ci.unitCost) * (1 - (Number(ci.discountPercent) || 0) / 100)
          return (
            <div key={idx} className="mb-3">
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Combo *</label>}
                  <select value={ci.comboId} onChange={e => setComboItem(idx, 'comboId', e.target.value)}
                    required className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <option value="">-- Chọn combo --</option>
                    {activeCombos.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Số combo</label>}
                  <input type="text" inputMode="numeric" value={ci.quantity}
                    onChange={e => { const r=e.target.value.replace(/\D/g,''); setComboItem(idx,'quantity',r) }}
                    onBlur={() => { const n=parseInt(ci.quantity); setComboItem(idx,'quantity',isNaN(n)||n<1?1:n) }}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div className="w-36">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Giá nhập 1 combo (₫)</label>}
                  <input type="text" inputMode="numeric"
                    value={ci.unitCost === 0 || ci.unitCost === '' ? '' : Number(ci.unitCost).toLocaleString('vi-VN')}
                    placeholder="0"
                    onChange={e => { const r=e.target.value.replace(/\./g,'').replace(/,/g,''); if(r===''||/^\d+$/.test(r)) setComboItem(idx,'unitCost',r===''?0:Number(r)) }}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div className="w-20">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">CK %</label>}
                  <input type="text" inputMode="decimal" value={ci.discountPercent}
                    onChange={e => { const r=e.target.value.replace(/[^\d.]/g,''); setComboItem(idx,'discountPercent',r) }}
                    onBlur={() => { const n=parseFloat(ci.discountPercent); setComboItem(idx,'discountPercent',isNaN(n)||n<0?0:n>100?100:n) }}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" placeholder="0" />
                </div>
                <div className="w-28 text-right pb-2">
                  {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sau CK</label>}
                  <span className="text-xs font-semibold text-purple-600">
                    {afterDisc.toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                <button type="button" onClick={() => removeComboItem(idx)}
                  className="text-red-500 hover:text-red-700 pb-2 text-lg">&times;</button>
              </div>
              {/* Hiện thành phần của combo đã chọn */}
              {selectedCombo && (
                <div className="mt-1 ml-2 flex flex-wrap gap-1">
                  {(selectedCombo.items || []).map((it, i) => (
                    <span key={i} className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full">
                      {it.productCode} ×{it.quantity * Number(ci.quantity)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {comboItems.filter(c => c.comboId).length > 0 && (
          <div className="mt-1 bg-purple-50 border border-purple-100 rounded-lg p-2 text-xs text-purple-700">
            💡 Chi phí combo được phân bổ đều vào từng SP thành phần.
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={loading}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
          {loading ? 'Đang lưu...' : 'Tạo phiếu nhập'}
        </button>
      </div>
    </form>
  )
}

// ── Import Excel Phiếu Nhập ───────────────────────────────────────────────────
function ImportReceiptExcelForm({ onClose, onSuccess }) {
  const today = new Date().toISOString().split('T')[0]
  const [step, setStep]               = useState(1)
  const [file, setFile]               = useState(null)
  const [preview, setPreview]         = useState(null)
  const [previewing, setPreviewing]   = useState(false)
  const [activeTab, setActiveTab]     = useState('SP_DON')
  const [receiptDate, setReceiptDate] = useState(today) // mặc định = hôm nay

  // ── Supplier picker (search + inline create) ─────────────────────────────
  const [supplierName, setSupplierName]         = useState('')
  const [supplierId, setSupplierId]             = useState(null)
  const [supplierSearch, setSupplierSearch]     = useState('')
  const [supplierResults, setSupplierResults]   = useState([])
  const [supplierSearchDone, setSupplierSearchDone] = useState(false)
  const [showCreateSupplier, setShowCreateSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName]   = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [newSupplierAddress, setNewSupplierAddress] = useState('')
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const supplierTimer = useRef(null)

  const [note, setNote]               = useState('')
  const [shippingFee, setShippingFee] = useState(0)
  const [vatPercent, setVatPercent]   = useState(0)
  const [importing, setImporting]     = useState(false)
  const [result, setResult]           = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [dragging, setDragging]       = useState(false)
  const fileRef = useRef(null)

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => supplierService.getAll(),
    staleTime: 60_000,
  })
  const queryClient = useQueryClient()

  // Search NCC debounce 350ms
  const handleSupplierSearch = (val) => {
    setSupplierSearch(val)
    setSupplierSearchDone(false)
    setShowCreateSupplier(false)
    setSupplierResults([])
    if (!val.trim()) return
    clearTimeout(supplierTimer.current)
    supplierTimer.current = setTimeout(async () => {
      try {
        const res = await supplierService.getAll(val.trim())
        const list = Array.isArray(res) ? res : (res.content || [])
        setSupplierResults(list.slice(0, 6))
        setSupplierSearchDone(true)
        if (list.length === 0) {
          setShowCreateSupplier(true)
          setNewSupplierName(val.trim())
          setNewSupplierPhone(''); setNewSupplierAddress('')
        }
      } catch { setSupplierResults([]); setSupplierSearchDone(true) }
    }, 350)
  }

  const selectSupplier = (s) => {
    setSupplierId(s.id); setSupplierName(s.name)
    setSupplierSearch(''); setSupplierResults([])
    setSupplierSearchDone(false); setShowCreateSupplier(false)
  }

  const clearSupplier = () => {
    setSupplierId(null); setSupplierName('')
    setSupplierSearch(''); setSupplierResults([])
    setSupplierSearchDone(false); setShowCreateSupplier(false)
    setNewSupplierName(''); setNewSupplierPhone(''); setNewSupplierAddress('')
  }

  const handleCreateSupplier = async () => {
    const name = newSupplierName.trim()
    if (!name) { toast.error('Vui lòng nhập tên nhà cung cấp'); return }
    setCreatingSupplier(true)
    try {
      const created = await supplierService.create({
        name, phone: newSupplierPhone.trim() || null, address: newSupplierAddress.trim() || null,
      })
      toast.success(`✅ Đã tạo NCC "${created.name}"`)
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      selectSupplier(created)
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.response?.data?.detail || 'Lỗi tạo nhà cung cấp')
    } finally { setCreatingSupplier(false) }
  }

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { toast.error('Chỉ hỗ trợ file .xlsx'); return }
    setFile(f); setPreview(null); setResult(null); setStep(1)
  }

  const handlePreview = async () => {
    if (!file) { toast.error('Chưa chọn file'); return }
    setPreviewing(true); setPreview(null)
    try {
      const res = await receiptService.previewExcel(file)
      setPreview(res)
      setStep(2)
      // Mặc định active tab theo sheet có dữ liệu
      const hasCombo  = (res.rows || []).some(r => r.sheet === 'COMBO')
      const hasSingle = (res.rows || []).some(r => r.sheet === 'SP_DON')
      setActiveTab(hasSingle ? 'SP_DON' : hasCombo ? 'COMBO' : 'SP_DON')
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.message || 'Lỗi đọc file Excel')
    } finally { setPreviewing(false) }
  }

  const handleImport = async () => {
    if (!preview?.canImport) return
    if (!supplierId && !supplierName.trim()) { toast.error('Vui lòng chọn hoặc nhập tên nhà cung cấp'); return }
    setImporting(true); setResult(null)
    try {
      const res = await receiptService.importExcel(
        file, supplierName.trim(), note.trim(),
        Number(shippingFee) || 0, Number(vatPercent) || 0,
        supplierId || null,
        receiptDate !== today ? receiptDate : null  // null = hôm nay (backend tự dùng now())
      )
      setResult(res)
      if (res.successItems > 0) {
        toast.success(`✅ Tạo phiếu nhập ${res.receiptNo} thành công! (${res.successItems} SP)`)
        onSuccess()
      }
    } catch (e) {
      if (e?.response?.status === 422) {
        toast.error(`File có lỗi: ${(e.response.data?.validationErrors || []).length} dòng lỗi`, { duration: 5000 })
      } else {
        toast.error(e?.response?.data?.detail || 'Lỗi import')
      }
    } finally { setImporting(false) }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try { await receiptService.downloadTemplate(); toast.success('Đã tải template!') }
    catch { toast.error('Lỗi tải template') }
    finally { setDownloading(false) }
  }

  // Tính tổng chi phí preview (sau CK, chưa tính ship+VAT từ form)
  const totalGross    = preview?.totalAmount       ? Number(preview.totalAmount)       : 0
  const totalDisc     = preview?.totalAfterDiscount? Number(preview.totalAfterDiscount): 0
  const totalVatAmt   = totalDisc * (Number(vatPercent) || 0) / 100
  const grandTotal    = totalDisc + Number(shippingFee || 0) + totalVatAmt

  const spRows    = (preview?.rows || []).filter(r => r.sheet === 'SP_DON')
  // Combo qua Excel tạm thời bị vô hiệu hoá — không filter comboRows nữa
  const hasErrors = (preview?.errorRows || 0) > 0

  const statusBadge = (row) => {
    if (!row.isValid) return <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">❌ Lỗi</span>
    if (row.status === 'COMBO_EXPAND') return <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold">📦 Combo</span>
    if (row.status === 'NEW_PRODUCT')  return <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">✨ Mới</span>
    if (row.status === 'NEW_VARIANT')  return <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">🔀 Variant mới</span>
    return <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-semibold">✅ OK</span>
  }

  return (
    <div className="space-y-4">
      {/* ── Header download + upload ── */}
      <div className="flex gap-3">
        <div className="flex-1 bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-4 flex items-center justify-between">
          <div className="text-white min-w-0">
            <p className="font-bold text-sm">📥 Template Excel nhập kho</p>
            <p className="text-green-200 text-xs mt-0.5">Tải template · Điền dữ liệu · Upload để import</p>
          </div>
          <button onClick={handleDownload} disabled={downloading}
            className="bg-white text-green-700 font-bold px-3 py-2 rounded-lg text-xs shrink-0 disabled:opacity-70">
            {downloading ? '...' : '⬇️ Tải template'}
          </button>
        </div>
      </div>

      {/* ── Bước 1: Chọn file ── */}
      <div className={`border-2 rounded-xl transition-colors cursor-pointer ${
        step === 2 ? 'border-green-400 bg-green-50' : dragging ? 'border-green-500 bg-green-50' : 'border-dashed border-gray-300 hover:border-green-400'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => step === 1 && fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => handleFile(e.target.files?.[0])} />
        <div className="p-5 text-center">
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl">📄</span>
              <div className="text-left">
                <p className="font-semibold text-green-700 text-sm">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size/1024).toFixed(1)} KB</p>
              </div>
              <button type="button" onClick={e => { e.stopPropagation(); setFile(null); setPreview(null); setStep(1) }}
                className="text-xs text-red-500 underline ml-2">Đổi file</button>
            </div>
          ) : (
            <div className="py-4">
              <div className="text-4xl mb-2">📊</div>
              <p className="text-gray-600 text-sm font-medium">Kéo thả hoặc click để chọn file .xlsx</p>
              <p className="text-xs text-gray-400 mt-1">File có Sheet "SP Don" và/hoặc Sheet "Combo"</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Nút Preview ── */}
      {step === 1 && (
        <button onClick={handlePreview} disabled={!file || previewing}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {previewing
            ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Đang đọc file...</>
            : '🔍 Xem trước dữ liệu (Preview)'}
        </button>
      )}

      {/* ── Bước 2: Preview + Form + Xác nhận ── */}
      {step === 2 && preview && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className={`rounded-xl p-4 flex flex-wrap gap-4 items-center ${hasErrors ? 'bg-red-50 border-2 border-red-300' : 'bg-green-50 border border-green-200'}`}>
            <div className="flex-1">
              <p className={`font-bold text-base ${hasErrors ? 'text-red-700' : 'text-green-700'}`}>
                {hasErrors ? `❌ ${preview.errorRows} dòng lỗi — cần sửa trước khi tạo phiếu` : `✅ ${preview.validRows} dòng hợp lệ — sẵn sàng tạo phiếu`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Tổng: {preview.totalRows} dòng SP Đơn
                {preview.warnings?.length > 0 && ` | ⚠️ ${preview.warnings.length} cảnh báo`}
              </p>
            </div>
            <button onClick={() => { setStep(1); setPreview(null) }}
              className="text-xs text-gray-500 border rounded-lg px-3 py-1.5 hover:bg-white">
              ← Đổi file
            </button>
          </div>

          {/* Bảng preview SP Don — không có tab Combo */}
          <div className="overflow-auto max-h-72 border rounded-xl">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-gray-600 text-xs">
                    <th className="px-3 py-2 text-left w-10">Dòng</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                    <th className="px-3 py-2 text-left">Mã SP</th>
                    <th className="px-3 py-2 text-left">Mã Variant</th>
                    <th className="px-3 py-2 text-left">Tên SP</th>
                    <th className="px-3 py-2 text-right">SL</th>
                    <th className="px-3 py-2 text-right">Giá nhập</th>
                    <th className="px-3 py-2 text-right">CK%</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                    <th className="px-3 py-2 text-left">Ghi chú / Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {spRows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-6 text-gray-400">Sheet "SP Don" không có dữ liệu</td></tr>
                  ) : spRows.map((row, i) => (
                    <tr key={i} className={`border-t ${!row.isValid ? 'bg-red-50' : row.isNew ? 'bg-amber-50' : i%2===0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-1.5 text-gray-400 text-center">{row.lineNumber}</td>
                      <td className="px-3 py-1.5">{statusBadge(row)}</td>
                      <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">{row.productCode || <span className="text-gray-400 italic">mới</span>}</td>
                      <td className="px-3 py-1.5 font-mono text-purple-600">{row.variantCode || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-1.5 text-gray-700 max-w-[150px] truncate">{row.productName || <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{row.quantity ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right">{row.unitCost ? Number(row.unitCost).toLocaleString('vi-VN') : '—'}</td>
                      <td className="px-3 py-1.5 text-right text-orange-600">{row.discountPercent ? `${Number(row.discountPercent)}%` : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-green-700">{row.lineTotal ? Number(row.lineTotal).toLocaleString('vi-VN')+'₫' : '—'}</td>
                      <td className="px-3 py-1.5">
                        {row.errorMessage && <p className="text-red-600 font-medium">{row.errorMessage}</p>}
                        {row.warningMessage && <p className="text-amber-600">{row.warningMessage}</p>}
                        {!row.errorMessage && !row.warningMessage && <span className="text-gray-400">{row.note || '—'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>

          {/* Warnings */}
          {preview.warnings?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-28 overflow-y-auto">
              <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ {preview.warnings.length} cảnh báo:</p>
              {preview.warnings.map((w,i) => <p key={i} className="text-xs text-amber-600">• {w}</p>)}
            </div>
          )}

          {/* Form thông tin phiếu — LUÔN hiện để user xem tổng chi phí dù có lỗi */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-bold text-gray-700">📝 Thông tin phiếu nhập</p>
            <div className="grid grid-cols-2 gap-3">
              {/* ── Supplier picker search + inline create ── */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-700 mb-1">🏭 Nhà cung cấp *</label>
                {supplierId ? (
                  <div className="flex items-center gap-2 border-2 border-green-300 rounded-lg px-3 py-2 bg-green-50">
                    <span className="text-green-600 text-sm">🏭</span>
                    <span className="flex-1 text-sm font-semibold text-green-800 truncate">{supplierName}</span>
                    <button type="button" onClick={clearSupplier}
                      className="text-gray-400 hover:text-red-500 text-xl leading-none flex-shrink-0">&times;</button>
                  </div>
                ) : (
                  <>
                    <input
                      value={supplierSearch}
                      onChange={e => handleSupplierSearch(e.target.value)}
                      placeholder="Tìm theo tên nhà cung cấp..."
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    {/* Dropdown kết quả */}
                    {supplierResults.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                        {supplierResults.map(s => (
                          <button key={s.id} type="button" onClick={() => selectSupplier(s)}
                            className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm border-b last:border-0 flex items-center gap-2">
                            <span className="text-xs bg-green-100 text-green-700 font-mono px-1.5 py-0.5 rounded flex-shrink-0">{s.code}</span>
                            <span className="font-medium flex-1 truncate">{s.name}</span>
                            {s.phone && <span className="text-gray-400 text-xs flex-shrink-0">{s.phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Panel tạo mới NCC */}
                    {showCreateSupplier && (
                      <div className="mt-2 border-2 border-dashed border-green-300 rounded-xl p-3 bg-green-50 space-y-2">
                        <p className="text-xs font-semibold text-green-700">
                          ➕ Không tìm thấy "<span className="italic">{supplierSearch}</span>" — Tạo NCC mới?
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          <div>
                            <label className="block text-xs text-gray-600 mb-0.5">Tên NCC <span className="text-red-500">*</span></label>
                            <input value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)}
                              placeholder="Công ty TNHH..."
                              className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" autoFocus />
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="block text-xs text-gray-600 mb-0.5">SĐT</label>
                              <input type="tel" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)}
                                placeholder="0901234567"
                                className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-0.5">Địa chỉ</label>
                              <input value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)}
                                placeholder="(tùy chọn)"
                                className="w-full border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={handleCreateSupplier}
                            disabled={creatingSupplier || !newSupplierName.trim()}
                            className="flex-1 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">
                            {creatingSupplier ? '⏳ Đang tạo...' : '✅ Tạo & chọn NCC này'}
                          </button>
                          <button type="button" onClick={() => { setShowCreateSupplier(false); setSupplierSearch('') }}
                            className="px-3 py-1.5 border rounded-lg text-xs text-gray-500 hover:bg-gray-100">Bỏ qua</button>
                        </div>
                      </div>
                    )}
                    {/* Chưa search → nhập tay */}
                    {!supplierSearch && !showCreateSupplier && (
                      <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
                        placeholder="...hoặc nhập tên NCC thủ công"
                        className="w-full border border-dashed rounded-lg px-3 py-1.5 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-green-300 mt-1" />
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú phiếu</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="VD: Nhập hàng tháng 4"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              {/* ── Ngày nhập kho ── */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  📅 Ngày nhập kho
                  <span className="ml-1 text-gray-400 font-normal">— mặc định hôm nay</span>
                </label>
                <input type="date" value={receiptDate} max={today}
                  onChange={e => setReceiptDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                {receiptDate && receiptDate < today && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Nhập ngày quá khứ — nhớ điền cột N (Ngày HSD) trong Excel để FEFO chính xác
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">🚚 Phí vận chuyển (₫)</label>
                <input type="text" inputMode="numeric"
                  value={shippingFee === 0 || shippingFee === '' ? '' : Number(shippingFee).toLocaleString('vi-VN')}
                  onChange={e => { const r=e.target.value.replace(/\./g,'').replace(/,/g,''); if(r===''||/^\d+$/.test(r)) setShippingFee(r===''?0:Number(r)) }}
                  placeholder="0"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">🧾 Thuế GTGT (VAT %)</label>
                <input type="text" inputMode="decimal" value={vatPercent}
                  onChange={e => { const r=e.target.value.replace(/[^\d.]/g,''); setVatPercent(r) }}
                  onBlur={() => { const n=parseFloat(vatPercent); setVatPercent(isNaN(n)||n<0?0:n>100?100:n) }}
                  placeholder="0"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>

            {/* Tổng chi phí — luôn tính theo VAT/ship hiện tại, chỉ dựa trên dòng hợp lệ */}
            <div className={`rounded-xl p-4 space-y-1.5 text-sm border ${hasErrors ? 'bg-gray-50 border-gray-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`font-bold mb-2 ${hasErrors ? 'text-gray-600' : 'text-green-800'}`}>
                💰 Tổng chi phí dự kiến {hasErrors && <span className="font-normal text-xs text-gray-400">(chỉ tính dòng hợp lệ)</span>}
              </p>
              <div className="flex justify-between text-gray-600">
                <span>Tiền gốc ({preview.validRows} dòng hợp lệ):</span>
                <span className="font-medium">{totalGross.toLocaleString('vi-VN')} ₫</span>
              </div>
              {totalDisc < totalGross && (
                <div className="flex justify-between text-green-700">
                  <span>Sau chiết khấu:</span>
                  <span className="font-medium">
                    {totalDisc.toLocaleString('vi-VN')} ₫
                    <span className="text-xs text-gray-400 ml-1">(-{(totalGross - totalDisc).toLocaleString('vi-VN')} ₫)</span>
                  </span>
                </div>
              )}
              {Number(shippingFee) > 0 && (
                <div className="flex justify-between text-blue-600">
                  <span>+ Phí vận chuyển:</span>
                  <span>{Number(shippingFee).toLocaleString('vi-VN')} ₫</span>
                </div>
              )}
              {Number(vatPercent) > 0 && (
                <div className="flex justify-between text-purple-600">
                  <span>+ VAT {vatPercent}% (trên {totalDisc.toLocaleString('vi-VN')} ₫):</span>
                  <span>{Math.round(totalVatAmt).toLocaleString('vi-VN')} ₫</span>
                </div>
              )}
              <div className={`flex justify-between font-bold border-t pt-2 text-base ${hasErrors ? 'text-gray-500' : 'text-green-800'}`}>
                <span>TỔNG THỰC TRẢ:</span>
                <span className="text-lg">{grandTotal.toLocaleString('vi-VN')} ₫</span>
              </div>
              {hasErrors && (
                <p className="text-xs text-red-500 pt-1">⚠️ Tổng trên chưa chính xác vì còn {preview.errorRows} dòng lỗi chưa được tính</p>
              )}
            </div>
          </div>

          {/* Nút xác nhận */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Hủy</button>
            {hasErrors ? (
              <div className="flex-1 bg-red-50 border border-red-300 rounded-xl px-4 py-2.5 text-center">
                <p className="text-red-600 text-sm font-semibold">🚫 Không thể tạo phiếu — cần sửa {preview.errorRows} dòng lỗi</p>
                <p className="text-xs text-red-500 mt-0.5">Sửa file Excel rồi upload lại</p>
              </div>
            ) : (
              <button onClick={handleImport}
                disabled={(!supplierId && !supplierName.trim()) || importing}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {importing
                  ? <><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Đang tạo phiếu...</>
                  : `✅ Tạo phiếu nhập từ Excel (${preview.validRows} dòng hợp lệ)`}
              </button>
            )}
          </div>

          {/* Kết quả */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
              <p className="font-bold text-green-800">✅ Tạo phiếu thành công!</p>
              <p className="text-green-700 mt-1">Phiếu: <b className="font-mono">{result.receiptNo}</b> — {result.successItems} SP — {result.newProducts} SP mới tạo</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── EditMetaModal — Sửa ghi chú + NCC (không ảnh hưởng tồn kho) ─────────────
function EditMetaModal({ receipt, onClose, onSave, saving }) {
  const today = new Date().toISOString().split('T')[0]
  const [note, setNote] = useState(receipt.note || '')
  const [supplierName, setSupplierName] = useState(receipt.supplierName || '')
  const [supplierId, setSupplierId] = useState(receipt.supplierId || null)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierResults, setSupplierResults] = useState([])
  // receiptDate: hiển thị ngày hiện tại của phiếu, cho phép sửa
  const [receiptDate, setReceiptDate] = useState(
    receipt.receiptDate ? receipt.receiptDate.split('T')[0] : today
  )
  const searchTimer = useRef(null)

  const handleSupplierSearch = (val) => {
    setSupplierSearch(val)
    setSupplierName(val)
    setSupplierId(null)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSupplierResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await supplierService.getAll({ q: val.trim() })
        setSupplierResults((res.content || res).slice(0, 6))
      } catch { setSupplierResults([]) }
    }, 300)
  }

  const selectSupplier = (s) => {
    setSupplierId(s.id)
    setSupplierName(s.name)
    setSupplierSearch('')
    setSupplierResults([])
  }

  const handleSubmit = () => {
    onSave({
      note: note.trim() || null,
      supplierId: supplierId || null,
      supplierName: supplierName.trim() || null,
      receiptDate: receiptDate || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="font-bold text-gray-800">✏️ Sửa thông tin phiếu</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="font-mono text-blue-600">{receipt.receiptNo}</span>
              {' · '}Sửa được ghi chú, nhà cung cấp và ngày nhập
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Nhà cung cấp */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">🏭 Nhà cung cấp</label>
            {supplierId ? (
              <div className="flex items-center gap-2 border border-green-300 rounded-lg px-3 py-2 bg-green-50">
                <span className="flex-1 text-sm font-medium text-green-800">{supplierName}</span>
                <button type="button" onClick={() => { setSupplierId(null); setSupplierName('') }}
                  className="text-gray-400 hover:text-red-500">&times;</button>
              </div>
            ) : (
              <>
                <input
                  value={supplierSearch || supplierName}
                  onChange={e => handleSupplierSearch(e.target.value)}
                  placeholder="Tìm hoặc nhập tên NCC..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                {supplierResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                    {supplierResults.map(s => (
                      <button key={s.id} type="button" onClick={() => selectSupplier(s)}
                        className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm border-b last:border-0">
                        <span className="font-medium">{s.name}</span>
                        {s.phone && <span className="text-gray-400 text-xs ml-2">{s.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">📝 Ghi chú</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="VD: Nhập hàng tháng 4 từ NCC Hải Hà"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          {/* Ngày nhập kho */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              📅 Ngày nhập kho
            </label>
            <input
              type="date"
              value={receiptDate}
              max={today}
              onChange={e => setReceiptDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            {receiptDate && receiptDate < today && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Ngày quá khứ — HSD của các lô trong phiếu này không được cập nhật lại tự động.
              </p>
            )}
          </div>

          {/* Thông báo */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            ⚠️ <b>Lưu ý</b>: Không thể sửa số lượng, giá vốn hay sản phẩm sau khi phiếu đã tạo.
            Những thay đổi này ảnh hưởng đến tồn kho và giá vốn FEFO.
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium">
            Hủy
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
            {saving ? '⏳ Đang lưu...' : '💾 Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReceiptsPage() {
  const [page, setPage] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [detail, setDetail] = useState(null)
  const [editMeta, setEditMeta] = useState(null)   // receipt đang sửa metadata
  const [printReceipt, setPrintReceipt] = useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useReceipts(page, from || undefined, to || undefined)
  const { data: products = [] } = useProducts()
  const { create, updateMeta, remove } = useReceiptMutations()

  const receipts = data?.content || []
  const totalPages = data?.totalPages || 1
  const { sorted: sortedReceipts, SortHeader } = useSort(receipts, 'receiptDate', 'desc')

  const handleCreate = async (formData) => {
    const newReceipt = await create.mutateAsync(formData)
    setShowModal(false)
    setPrintReceipt(newReceipt)
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`Xóa phiếu ${r.receiptNo}?\n\nLưu ý: Chỉ xóa được nếu hàng chưa được bán.`)) return
    try {
      await remove.mutateAsync(r.id)
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.detail || ''
      if (msg.includes('đã được bán') || msg.includes('sold')) {
        toast.error(`❌ Không thể xóa phiếu ${r.receiptNo} — hàng đã được bán một phần. Hãy tạo phiếu điều chỉnh tồn kho thay thế.`, { duration: 5000 })
      } else {
        toast.error(msg || 'Lỗi khi xóa phiếu nhập')
      }
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Phiếu Nhập Kho"
        actions={<>
          <button onClick={() => setShowImportModal(true)}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm font-medium">
            📊 Import Excel
          </button>
          <button onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
            + Tạo phiếu nhập
          </button>
        </>}
      />

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
                className="px-3 py-2 border rounded-lg text-sm text-gray-500 hover:text-gray-700">✕ Xóa lọc</button>
            </div>
          )}
        </div>

        <AdminTable
          loading={isLoading}
          rows={sortedReceipts}
          emptyText="Chưa có phiếu nhập nào"
          columns={[
            { key: 'receiptNo', label: 'Số phiếu', tdClassName: 'font-mono text-blue-600 cursor-pointer hover:underline',
              render: r => <span onClick={() => setDetail(r)}>{r.receiptNo}</span> },
            { key: 'supplierName', label: 'Nhà cung cấp', render: r => r.supplierName || '—' },
            { key: 'receiptDate', label: 'Ngày nhập', render: r => dayjs(r.receiptDate).format('DD/MM/YYYY HH:mm') },
            { key: 'totalAmount', label: 'Tổng thực trả', thClassName: 'text-right', tdClassName: 'text-right font-medium text-green-700',
              render: r => Number(r.totalAmount).toLocaleString('vi-VN') + ' ₫' },
            { key: 'note', label: 'Ghi chú', render: r => r.note || '—' },
            { key: 'actions', label: 'Thao tác', isAction: true, thClassName: 'text-center', tdClassName: 'text-center',
              render: r => (
                <div className="flex items-center justify-center gap-1.5">
                  <button onClick={() => setEditMeta(r)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50" title="Sửa ghi chú / NCC">✏️ Sửa</button>
                  <button onClick={() => setPrintReceipt({ ...r, showPrinter: true })}
                    className="text-amber-600 hover:text-amber-800 text-xs font-medium px-2 py-1 rounded hover:bg-amber-50">🏷️ In nhãn</button>
                  <button onClick={() => handleDelete(r)}
                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50">🗑️ Xóa</button>
                </div>
              )},
          ]}
          mobileCard={r => (
            <div>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <button onClick={() => setDetail(r)}
                    className="font-mono text-blue-600 font-bold text-sm hover:underline">{r.receiptNo}</button>
                  <p className="text-xs text-gray-500 mt-0.5">{dayjs(r.receiptDate).format('DD/MM/YYYY HH:mm')}</p>
                </div>
                <span className="text-base font-bold text-green-700">{Number(r.totalAmount).toLocaleString('vi-VN')} ₫</span>
              </div>
              <div className="flex items-center gap-2 text-xs mb-3 text-gray-600">
                <span>🏭 {r.supplierName || 'Không có NCC'}</span>
                {r.note && <span className="text-gray-400">· {r.note}</span>}
              </div>
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button onClick={() => setDetail(r)}
                  className="flex-1 text-xs bg-gray-50 text-gray-700 hover:bg-gray-100 py-1.5 rounded-lg font-medium text-center">👁️ Chi tiết</button>
                <button onClick={() => setEditMeta(r)}
                  className="flex-1 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 py-1.5 rounded-lg font-medium text-center">✏️ Sửa</button>
                <button onClick={() => setPrintReceipt({ ...r, showPrinter: true })}
                  className="flex-1 text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 py-1.5 rounded-lg font-medium text-center">🏷️ In nhãn</button>
                <button onClick={() => handleDelete(r)}
                  className="flex-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 py-1.5 rounded-lg font-medium text-center">🗑️ Xóa</button>
              </div>
            </div>
          )}
        />

        <div className="flex items-center justify-between pt-3 border-t mt-3">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">← Trước</button>
          <span className="text-sm text-gray-500">Trang {page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page>=totalPages-1}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">Sau →</button>
        </div>
      </AdminCard>

      {/* Create modal (nhập tay) */}
      {showModal && (
        <Modal title="Tạo phiếu nhập kho" onClose={() => setShowModal(false)}>
          <ReceiptForm products={products} onSubmit={handleCreate} loading={create.isLoading} />
        </Modal>
      )}

      {/* Import Excel modal */}
      {showImportModal && (
        <Modal title="📊 Import phiếu nhập từ Excel" onClose={() => setShowImportModal(false)}>
          <ImportReceiptExcelForm
            onClose={() => setShowImportModal(false)}
            onSuccess={() => {
              queryClient.invalidateQueries(['receipts'])
              queryClient.invalidateQueries(['products'])
            }}
          />
        </Modal>
      )}

      {/* Detail modal */}
      {detail && (
        <Modal title={`Chi tiết phiếu ${detail.receiptNo}`} onClose={() => setDetail(null)}>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500">Nhà cung cấp:</span> {detail.supplierName || '—'}</div>
              <div><span className="text-gray-500">Ngày:</span> {dayjs(detail.receiptDate).format('DD/MM/YYYY HH:mm')}</div>
              <div><span className="text-gray-500">Người tạo:</span> {detail.createdBy}</div>
              <div><span className="text-gray-500">Ghi chú:</span> {detail.note || '—'}</div>
              {Number(detail.shippingFee) > 0 && (
                <div className="col-span-2 text-blue-600 font-medium">
                  🚚 Phí vận chuyển: {Number(detail.shippingFee).toLocaleString('vi-VN')} ₫
                </div>
              )}
            </div>
            <table className="w-full border rounded-lg overflow-hidden mt-3 text-xs">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <th className="text-left px-3 py-2">Sản phẩm</th>
                  <th className="text-right px-3 py-2">SL</th>
                  <th className="text-right px-3 py-2">Đơn giá gốc</th>
                  <th className="text-right px-3 py-2">CK %</th>
                  <th className="text-right px-3 py-2">Sau CK</th>
                  <th className="text-right px-3 py-2">+ Ship</th>
                  <th className="text-right px-3 py-2 text-green-700 font-bold">Giá vốn cuối</th>
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((it, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{it.productName}</td>
                    <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-2 text-right">{Number(it.unitCost).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(it.discountPercent) > 0
                        ? <span className="text-orange-600 font-medium">{it.discountPercent}%</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{Number(it.discountedCost).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2 text-right text-blue-600">
                      {Number(it.shippingAllocated) > 0
                        ? `+${Number(it.shippingAllocated).toLocaleString('vi-VN')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-green-700">
                      {Number(it.finalCost).toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={6} className="px-3 py-2 font-semibold text-right text-gray-700">Tổng thực trả (sau CK + ship + VAT):</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 text-base">
                    {Number(detail.totalAmount).toLocaleString('vi-VN')} ₫
                  </td>
                </tr>
                {Number(detail.shippingFee) > 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-xs text-blue-500">↳ Trong đó phí ship:</td>
                    <td className="px-3 py-2 text-right text-xs text-blue-500">
                      {Number(detail.shippingFee).toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                )}
                {Number(detail.totalVat) > 0 && (() => {
                  // Tính ngược % VAT từ totalVat / (totalAmount - ship - totalVat) * 100
                  const base = Number(detail.totalAmount) - Number(detail.shippingFee || 0) - Number(detail.totalVat)
                  const vatPct = base > 0 ? Math.round(Number(detail.totalVat) / base * 100 * 10) / 10 : 0
                  return (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-right text-xs text-purple-500">
                        ↳ Trong đó VAT{vatPct > 0 ? ` ${vatPct}%` : ''}:
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-purple-500">
                        {Number(detail.totalVat).toLocaleString('vi-VN')} ₫
                      </td>
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          </div>
        </Modal>
      )}

      {/* ── In nhãn mã vạch sau khi tạo phiếu nhập ────────────────────── */}
      {printReceipt && (() => {
        // Build items cho printer: { product, qty }
        const printerItems = (printReceipt.items || []).map(it => {
          const product = products.find(p => p.id === it.productId || p.name === it.productName)
          return {
            product: product ? {
              ...product,
              categoryName: product.categoryName || product.category?.name || it.categoryName || ''
            } : {
              id: it.productId,
              name: it.productName,
              code: it.productCode || it.productName,
              sellPrice: it.sellPrice || 0,
              unit: it.unit || '',
              categoryName: it.categoryName || '',
            },
            qty: it.quantity,
          }
        }).filter(x => x.product)

        if (printerItems.length === 0) { setPrintReceipt(null); return null }

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
              <div className="text-5xl mb-3">🏷️</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Tạo phiếu nhập thành công!</h3>
              <p className="text-sm text-gray-500 mb-6">
                Phiếu <b>{printReceipt.receiptNo}</b> đã được lưu.<br />
                Bạn có muốn in nhãn mã vạch để dán cho sản phẩm không?
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setPrintReceipt(null)}
                  className="px-5 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50 text-sm"
                >
                  Bỏ qua
                </button>
                <button
                  onClick={() => {
                    // Chuyển sang màn hình in nhãn
                    setPrintReceipt({ ...printReceipt, showPrinter: true })
                  }}
                  className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700"
                >
                  🖨️ In nhãn ngay
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal sửa metadata phiếu nhập (ghi chú + NCC) ── */}
      {editMeta && (
        <EditMetaModal
          receipt={editMeta}
          onClose={() => setEditMeta(null)}
          onSave={async (data) => {
            await updateMeta.mutateAsync({ id: editMeta.id, data })
            setEditMeta(null)
          }}
          saving={updateMeta.isLoading}
        />
      )}

      {/* ── BarcodeLabelPrinter ─────────────────────────────────────────── */}
      {printReceipt?.showPrinter && (() => {
        const printerItems = (printReceipt.items || []).map(it => {
          const product = products.find(p => p.id === it.productId || p.name === it.productName)
          return {
            product: product ? {
              ...product,
              categoryName: product.categoryName || product.category?.name || it.categoryName || ''
            } : {
              id: it.productId,
              name: it.productName,
              code: it.productCode || it.productName,
              sellPrice: it.sellPrice || 0,
              unit: it.unit || '',
              categoryName: it.categoryName || '',
            },
            qty: it.quantity,
          }
        }).filter(x => x.product)

        return (
          <BarcodeLabelPrinter
            items={printerItems}
            receiptDate={dayjs(printReceipt.receiptDate).format('DD/MM/YYYY')}
            receiptNo={printReceipt.receiptNo}
            onClose={() => setPrintReceipt(null)}
          />
        )
      })()}
    </div>
  )
}
