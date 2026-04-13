import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { comboService } from '../../services/comboService'
import { useProducts } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import toast from 'react-hot-toast'

/**
 * Trang quản lý Combo sản phẩm — Mô hình KiotViet
 *
 * Combo IS-A Product (productType=COMBO):
 * - Tồn kho ảo = min( floor(thành_phần[i].stock / qty_cần[i]) )
 * - Giá vốn   = Σ( component.costPrice × qty )
 * - Khi bán   → expand thành nhiều line items, trừ kho từng thành phần
 * - Không nhập kho combo trực tiếp
 * - Không lồng combo trong combo
 */

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Combo Form (Tạo / Sửa) ────────────────────────────────────────────────────
function ComboForm({ initial, products, categories, onSubmit, loading, onClose }) {
  const [form, setForm] = useState(initial || {
    code: '', name: '', description: '', sellPrice: '', active: true,
    categoryId: '', items: [],
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const addItem    = () => setForm(f => ({ ...f, items: [...(f.items || []), { productId: '', quantity: 1 }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const setItem    = (idx, key, val) => setForm(f => ({
    ...f, items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it)
  }))

  // Chỉ hiện SP SINGLE trong dropdown thành phần
  const singleProducts = products.filter(p => p.active && p.productType !== 'COMBO')

  // Tính tổng giá lẻ & giá vốn từ default variant
  const totalRetail = (form.items || []).reduce((s, it) => {
    const p = singleProducts.find(p => String(p.id) === String(it.productId))
    const dv = p?.variants?.find(v => v.isDefault) || p?.variants?.[0]
    return s + (dv ? Number(dv.sellPrice) * Number(it.quantity) : 0)
  }, 0)
  const totalCost = (form.items || []).reduce((s, it) => {
    const p = singleProducts.find(p => String(p.id) === String(it.productId))
    const dv = p?.variants?.find(v => v.isDefault) || p?.variants?.[0]
    return s + (dv ? Number(dv.costPrice || 0) * Number(it.quantity) : 0)
  }, 0)
  const saving = totalRetail - (Number(form.sellPrice) || 0)

  // Virtual stock preview real-time
  const virtualStock = (form.items || []).filter(it => it.productId && Number(it.quantity) > 0)
    .reduce((min, it) => {
      const p = singleProducts.find(p => String(p.id) === String(it.productId))
      if (!p) return min
      const dv = p.variants?.find(v => v.isDefault) || p.variants?.[0]
      const can = Math.floor((dv?.stockQty ?? 0) / Number(it.quantity))
      return Math.min(min, can)
    }, Infinity)
  const displayStock = isFinite(virtualStock) ? virtualStock : 0

  const handleSubmit = (e) => {
    e.preventDefault()
    const validItems = (form.items || []).filter(it => it.productId && Number(it.quantity) > 0)
    if (!validItems.length) { toast.error('Combo phải có ít nhất 1 sản phẩm'); return }
    const ids = validItems.map(it => it.productId)
    if (new Set(ids).size !== ids.length) { toast.error('Không được chọn trùng sản phẩm'); return }
    onSubmit({
      code:        form.code?.trim() || null,
      name:        form.name,
      description: form.description?.trim() || null,
      sellPrice:   Number(form.sellPrice) || 0,
      active:      form.active,
      categoryId:  form.categoryId ? Number(form.categoryId) : null,
      items:       validItems.map(it => ({ productId: Number(it.productId), quantity: Number(it.quantity) }))
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Row 1: Mã + Tên */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Mã combo <span className="text-gray-400 font-normal">(để trống → tự tạo)</span>
          </label>
          <input value={form.code} onChange={e => set('code', e.target.value)}
            placeholder="VD: COMBO001"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tên combo *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="VD: Combo Bánh Tráng Đặc Biệt"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
      </div>

      {/* Mô tả */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Mô tả <span className="text-gray-400 font-normal">(tuỳ chọn)</span>
        </label>
        <textarea rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)}
          placeholder="VD: Combo gồm 5 bịch bánh tráng + 2 gói muối — tiết kiệm 15%"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
      </div>

      {/* Row 2: Giá bán + Danh mục + Toggle */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Giá bán combo (₫) *
            {totalRetail > 0 && (
              <span className="ml-1 text-gray-400 font-normal">(lẻ: {totalRetail.toLocaleString('vi-VN')} ₫)</span>
            )}
          </label>
          <input required type="text" inputMode="numeric"
            value={form.sellPrice === 0 || form.sellPrice === '' ? '' : Number(form.sellPrice).toLocaleString('vi-VN')}
            onChange={e => { const r=e.target.value.replace(/\./g,'').replace(/,/g,''); if(r===''||/^\d+$/.test(r)) set('sellPrice',r===''?0:Number(r)) }}
            onBlur={() => { if(form.sellPrice===''||form.sellPrice===0) set('sellPrice',0) }}
            placeholder="150000"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          {saving > 0 && <p className="text-xs text-green-600 mt-0.5">✅ Tiết kiệm: {saving.toLocaleString('vi-VN')} ₫</p>}
          {saving < 0 && <p className="text-xs text-orange-500 mt-0.5">⚠️ Cao hơn lẻ {Math.abs(saving).toLocaleString('vi-VN')} ₫</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Danh mục</label>
          <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
            <option value="">-- Tự động lấy từ thành phần --</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Toggle active */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <div className={`relative w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}
            onClick={() => set('active', !form.active)}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-medium text-gray-700">{form.active ? 'Hoạt động' : 'Tạm tắt'}</span>
        </label>
      </div>

      {/* Thành phần combo */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-700 text-sm">📦 Thành phần combo</h4>
          <button type="button" onClick={addItem}
            className="text-purple-600 text-xs font-medium hover:underline">+ Thêm SP</button>
        </div>

        {!(form.items?.length) && (
          <div className="text-center py-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-xs">Chưa có sản phẩm nào</p>
            <button type="button" onClick={addItem}
              className="mt-1 text-purple-600 text-xs font-medium">+ Thêm ngay</button>
          </div>
        )}

        {(form.items || []).map((item, idx) => {
          const p  = singleProducts.find(p => String(p.id) === String(item.productId))
          const dv = p?.variants?.find(v => v.isDefault) || p?.variants?.[0]
          const lineRetail = dv ? Number(dv.sellPrice) * Number(item.quantity) : 0
          const canMake    = dv && Number(item.quantity) > 0
            ? Math.floor((dv.stockQty ?? 0) / Number(item.quantity)) : 0
          return (
            <div key={idx} className="flex gap-2 mb-2 items-end">
              <div className="flex-1">
                {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sản phẩm (chỉ SINGLE) *</label>}
                <select value={item.productId} onChange={e => setItem(idx, 'productId', e.target.value)}
                  required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">-- Chọn SP --</option>
                  {singleProducts.map(sp => {
                    const sdv = sp.variants?.find(v => v.isDefault) || sp.variants?.[0]
                    return (
                      <option key={sp.id} value={sp.id}>
                        {sp.code} - {sp.name} (Tồn: {sdv?.stockQty ?? 0} | {Number(sdv?.sellPrice ?? 0).toLocaleString('vi-VN')} ₫)
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="w-20">
                {idx === 0 && <label className="block text-xs text-gray-500 mb-1">SL cần</label>}
                <input type="text" inputMode="numeric" value={item.quantity}
                  onChange={e => { const r=e.target.value.replace(/\D/g,''); setItem(idx,'quantity',r) }}
                  onBlur={() => { const n=parseInt(item.quantity); setItem(idx,'quantity',isNaN(n)||n<1?1:n) }}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="w-28 pb-2 text-right shrink-0">
                <div className="text-xs text-gray-600">{p ? `${lineRetail.toLocaleString('vi-VN')} ₫` : '—'}</div>
                {p && <div className="text-xs text-blue-500">→ {canMake} combo</div>}
              </div>
              <button type="button" onClick={() => removeItem(idx)}
                className="text-red-500 pb-2 text-lg leading-none">&times;</button>
            </div>
          )
        })}

        {(form.items || []).length > 0 && (
          <div className="mt-2 bg-purple-50 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Tổng giá lẻ các thành phần:</span>
              <span className="font-medium">{totalRetail.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tổng giá vốn ước tính:</span>
              <span>{totalCost.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div className="flex justify-between text-blue-700 font-semibold border-t pt-1">
              <span>🔢 Tồn kho ảo (có thể bán):</span>
              <span>{displayStock} combo</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onClose}
          className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Hủy</button>
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60 font-semibold">
          {loading ? 'Đang lưu...' : '💾 Lưu combo'}
        </button>
      </div>
    </form>
  )
}

// ── Import Excel Form ─────────────────────────────────────────────────────────
function ImportExcelForm({ onClose, onSuccess }) {
  const [file, setFile]               = useState(null)
  const [loading, setLoading]         = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult]           = useState(null)
  const fileRef                       = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { toast.error('Chỉ hỗ trợ .xlsx'); return }
    setFile(f); setResult(null)
  }

  const handleDownload = async () => {
    setDownloading(true)
    try { await comboService.downloadTemplate(); toast.success('Đã tải template combo!') }
    catch { toast.error('Lỗi tải template') }
    finally { setDownloading(false) }
  }

  const handleImport = async () => {
    if (!file) { toast.error('Chưa chọn file'); return }
    setLoading(true); setResult(null)
    try {
      const res = await comboService.importExcel(file)
      setResult(res)
      if (res.created?.length > 0) {
        toast.success(`Import thành công ${res.created.length} combo!`)
        onSuccess()
      } else {
        toast.error('Không có combo nào được tạo')
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Lỗi import')
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Banner template */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="text-white min-w-0">
          <p className="font-bold text-sm">📥 Bước 1: Tải file template</p>
          <p className="text-purple-200 text-xs mt-0.5">
            Cột: Mã | Tên* | Giá* | ĐV | CatID | <strong>Mô tả</strong> | MãSP1* | SL1* | MãSP2 | SL2 | ...
          </p>
        </div>
        <button onClick={handleDownload} disabled={downloading}
          className="bg-white text-purple-700 font-bold px-4 py-2 rounded-lg hover:bg-purple-50 text-sm whitespace-nowrap disabled:opacity-70 shrink-0">
          {downloading ? '...' : '⬇️ Template'}
        </button>
      </div>

      {/* Cấu trúc nhanh */}
      <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs text-purple-800">
        <p className="font-semibold mb-1">📋 Cấu trúc file (từ dòng 4):</p>
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead><tr className="bg-purple-100">
              {['A:Mã','B:Tên*','C:Giá*','D:ĐV','E:CatID','F:Mô tả','G:SP1*','H:SL1*','I:SP2','J:SL2','...'].map(h =>
                <th key={h} className="border border-purple-200 px-1.5 py-1 text-left font-semibold whitespace-nowrap">{h}</th>
              )}
            </tr></thead>
            <tbody><tr className="bg-white">
              {['','Combo BT','150000','combo','','Combo gồm...','BT001','5','M001','2','...'].map((v,i) =>
                <td key={i} className="border border-purple-200 px-1.5 py-1 whitespace-nowrap">{v}</td>
              )}
            </tr></tbody>
          </table>
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${file ? 'border-purple-400 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50'}`}>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
          onChange={e => handleFile(e.target.files?.[0])} />
        {file
          ? <><p className="text-purple-700 font-semibold text-sm">✅ {file.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(file.size/1024).toFixed(1)} KB — Click để đổi file</p></>
          : <p className="text-gray-400 text-sm">📂 Kéo thả hoặc click để chọn file .xlsx</p>}
      </div>

      <button onClick={handleImport} disabled={!file || loading}
        className="w-full py-2.5 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50">
        {loading ? '⏳ Đang import...' : '🚀 Import Combo'}
      </button>

      {/* Kết quả */}
      {result && (
        <div className={`rounded-xl p-4 text-sm space-y-2
          ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`font-bold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? '✅' : '❌'} {result.message}
          </p>
          {result.created?.length > 0 && (
            <div>
              <p className="font-semibold text-green-700 text-xs mb-1">Đã tạo {result.created.length} combo:</p>
              <ul className="text-xs text-green-600 space-y-0.5 max-h-32 overflow-y-auto">
                {result.created.map((c, i) => <li key={i}>• {c}</li>)}
              </ul>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div>
              <p className="font-semibold text-red-700 text-xs mb-1">Lỗi ({result.errors.length}):</p>
              <ul className="text-xs text-red-600 space-y-0.5 max-h-40 overflow-y-auto bg-white rounded p-2 border border-red-200">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CombosPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editing,    setEditing]    = useState(null)   // { id, form }
  const [detail,     setDetail]     = useState(null)   // combo object
  const queryClient = useQueryClient()

  const { data: products   = [] } = useProducts()
  const { data: categories = [] } = useCategories()

  const { data: combos = [], isLoading } = useQuery({
    queryKey: ['combos'],
    queryFn:  comboService.getAll,
  })

  const createMutation = useMutation({
    mutationFn: comboService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combos'] })
      setShowCreate(false)
      toast.success('Tạo combo thành công!')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || e?.response?.data?.message || 'Lỗi tạo combo'),
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => comboService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combos'] })
      setEditing(null)
      toast.success('Cập nhật thành công!')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || e?.response?.data?.message || 'Lỗi cập nhật'),
  })
  const toggleMutation = useMutation({
    mutationFn: comboService.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['combos'] }),
    onError:   () => toast.error('Lỗi thay đổi trạng thái'),
  })
  const deleteMutation = useMutation({
    mutationFn: comboService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combos'] })
      toast.success('Đã xóa combo')
    },
    onError: () => toast.error('Lỗi xóa combo'),
  })

  const toEditForm = (c) => ({
    code:       c.code,
    name:       c.name,
    description: c.description || '',
    sellPrice:  c.sellPrice,
    active:     c.active,
    categoryId: c.categoryId || '',
    items:      (c.items || []).map(it => ({ productId: String(it.productId), quantity: it.quantity })),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">📦 Quản lý Combo</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Combo = Product(type=COMBO) theo mô hình KiotViet. Tồn kho ảo = min(thành phần / qty cần).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="border border-purple-400 text-purple-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-50">
            📥 Import Excel
          </button>
          <button onClick={() => setShowCreate(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-semibold text-sm shadow">
            + Tạo combo mới
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <p className="font-semibold text-purple-800 mb-0.5">🏗️ Mô hình KiotViet</p>
          <p className="text-purple-600">Combo IS-A Product với productType=COMBO. Có mã, danh mục như SP thường. Không lồng combo trong combo.</p>
        </div>
        <div>
          <p className="font-semibold text-purple-800 mb-0.5">📦 Tồn kho ảo</p>
          <p className="text-purple-600">stockQty = min(component.stock / qty_cần). Tự cập nhật sau mỗi giao dịch ảnh hưởng thành phần.</p>
        </div>
        <div>
          <p className="font-semibold text-purple-800 mb-0.5">💰 Giá vốn tự động</p>
          <p className="text-purple-600">costPrice = Σ(costPrice_SP × qty). Cập nhật realtime. Khi bán: expand → trừ kho từng thành phần.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Tổng combo', value: combos.length,                          icon: '📦' },
          { label: 'Hoạt động',  value: combos.filter(c => c.active).length,    icon: '✅' },
          { label: 'Tạm tắt',   value: combos.filter(c => !c.active).length,   icon: '⏸️' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Danh sách combo */}
      {combos.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-12 text-center">
          <div className="text-6xl mb-3">📦</div>
          <p className="font-medium text-gray-500">Chưa có combo nào</p>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={() => setShowImport(true)}
              className="border border-purple-400 text-purple-600 px-5 py-2 rounded-lg text-sm font-semibold">
              📥 Import Excel
            </button>
            <button onClick={() => setShowCreate(true)}
              className="bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 font-semibold text-sm">
              + Tạo mới
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {combos.map(combo => {
            const saving = (Number(combo.totalComponentRetailPrice) || 0) - Number(combo.sellPrice)
            const profitMargin = Number(combo.totalComponentCost) > 0
              ? Math.round((Number(combo.sellPrice) - Number(combo.totalComponentCost)) / Number(combo.sellPrice) * 100)
              : null
            return (
              <div key={combo.id}
                className={`bg-white rounded-xl shadow border-l-4 ${combo.active ? 'border-purple-500' : 'border-gray-300'}`}>
                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">
                          {combo.code}
                        </span>
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">COMBO</span>
                        {combo.categoryName && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{combo.categoryName}</span>
                        )}
                        {combo.active
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Hoạt động</span>
                          : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">Tạm tắt</span>}
                      </div>
                      <h3 className="font-bold text-gray-800 mt-1">{combo.name}</h3>
                      {combo.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{combo.description}</p>
                      )}
                    </div>
                    {/* Giá */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-purple-700">
                        {Number(combo.sellPrice).toLocaleString('vi-VN')} ₫
                      </p>
                      {Number(combo.totalComponentRetailPrice) > 0 && (
                        <p className="text-xs text-gray-400 line-through">
                          {Number(combo.totalComponentRetailPrice).toLocaleString('vi-VN')} ₫
                        </p>
                      )}
                      {saving > 0 && Number(combo.totalComponentRetailPrice) > 0 && (
                        <p className="text-xs text-green-600 font-medium">
                          -{Math.round(saving / Number(combo.totalComponentRetailPrice) * 100)}% cho khách
                        </p>
                      )}
                      {profitMargin !== null && (
                        <p className="text-xs text-blue-600">Margin: {profitMargin}%</p>
                      )}
                    </div>
                  </div>

                  {/* Tồn kho ảo + giá vốn */}
                  <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      combo.stockQty === 0 ? 'bg-red-100 text-red-600' :
                      combo.stockQty <= 5  ? 'bg-orange-100 text-orange-600' :
                                             'bg-blue-100 text-blue-700'}`}>
                      📊 Tồn kho ảo: {combo.stockQty} combo
                    </span>
                    {Number(combo.totalComponentCost) > 0 && (
                      <span className="text-gray-500">
                        Giá vốn: {Number(combo.totalComponentCost).toLocaleString('vi-VN')} ₫
                      </span>
                    )}
                  </div>

                  {/* Thành phần pills */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(combo.items || []).map((it, i) => (
                      <span key={i}
                        className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                        <span className="font-mono">{it.productCode}</span> ×{it.quantity}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2 border-t pt-2.5 flex-wrap">
                    <button onClick={() => setDetail(combo)}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium">
                      👁 Chi tiết
                    </button>
                    <button onClick={() => setEditing({ id: combo.id, form: toEditForm(combo) })}
                      className="text-xs px-3 py-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 font-medium">
                      ✏️ Sửa
                    </button>
                    <button onClick={() => toggleMutation.mutate(combo.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                        combo.active
                          ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                          : 'bg-green-100 text-green-600 hover:bg-green-200'}`}>
                      {combo.active ? '⏸ Tắt' : '▶ Bật'}
                    </button>
                    <button
                      onClick={() => window.confirm(`Xóa combo "${combo.name}"?`) && deleteMutation.mutate(combo.id)}
                      className="text-xs px-3 py-1.5 bg-red-100 text-red-500 rounded-lg hover:bg-red-200 font-medium ml-auto">
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <Modal title="📦 Tạo combo mới" onClose={() => setShowCreate(false)}>
          <ComboForm
            products={products} categories={categories}
            loading={createMutation.isPending}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)} />
        </Modal>
      )}
      {editing && (
        <Modal title="✏️ Chỉnh sửa combo" onClose={() => setEditing(null)}>
          <ComboForm
            initial={editing.form} products={products} categories={categories}
            loading={updateMutation.isPending}
            onClose={() => setEditing(null)}
            onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })} />
        </Modal>
      )}
      {showImport && (
        <Modal title="📥 Import Combo từ Excel" onClose={() => setShowImport(false)}>
          <ImportExcelForm
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['combos'] })
              setShowImport(false)
            }} />
        </Modal>
      )}
      {detail && (
        <Modal title={`📦 ${detail.name}`} onClose={() => setDetail(null)}>
          <div className="space-y-4">
            {/* Stats cards */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Mã combo</p>
                <p className="font-mono font-bold text-purple-700">{detail.code}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Giá bán</p>
                <p className="font-bold text-purple-700">{Number(detail.sellPrice).toLocaleString('vi-VN')} ₫</p>
              </div>
              <div className={`rounded-lg p-3 ${detail.stockQty === 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className="text-xs text-gray-500">Tồn kho ảo</p>
                <p className={`font-bold ${detail.stockQty === 0 ? 'text-red-600' : 'text-blue-700'}`}>
                  {detail.stockQty} combo
                </p>
              </div>
            </div>

            {detail.categoryName && (
              <p className="text-xs text-gray-500">
                Danh mục: <span className="font-medium text-gray-700">{detail.categoryName}</span>
              </p>
            )}

            {/* Mô tả */}
            {detail.description && (
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                <p className="text-xs font-medium text-purple-700 mb-0.5">📝 Mô tả combo</p>
                <p className="text-sm text-gray-700">{detail.description}</p>
              </div>
            )}

            {/* Bảng thành phần */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2 text-sm">📋 Thành phần combo</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-purple-50 text-xs text-gray-600">
                      <th className="text-left px-3 py-2">Sản phẩm</th>
                      <th className="text-center px-3 py-2">SL</th>
                      <th className="text-right px-3 py-2">Giá bán lẻ</th>
                      <th className="text-right px-3 py-2">Giá vốn dòng</th>
                      <th className="text-right px-3 py-2">Thành tiền lẻ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((it, i) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-purple-600 mr-1">{it.productCode}</span>
                          {it.productName}
                        </td>
                        <td className="px-3 py-2 text-center font-medium">{it.quantity}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-600">
                          {Number(it.unitSellPrice).toLocaleString('vi-VN')} ₫
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">
                          {it.lineCost ? `${Number(it.lineCost).toLocaleString('vi-VN')} ₫` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {Number(it.lineTotal).toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 text-xs font-semibold border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Tổng giá lẻ các thành phần:</td>
                      <td className="px-3 py-2 text-right">{Number(detail.totalComponentRetailPrice).toLocaleString('vi-VN')} ₫</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-gray-500">Tổng giá vốn:</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {Number(detail.totalComponentCost || 0).toLocaleString('vi-VN')} ₫
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-purple-700 font-bold text-sm">Giá bán combo:</td>
                      <td className="px-3 py-2 text-right text-purple-700 font-bold text-sm">
                        {Number(detail.sellPrice).toLocaleString('vi-VN')} ₫
                      </td>
                    </tr>
                    {Number(detail.totalComponentRetailPrice) > Number(detail.sellPrice) && (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-green-600">Khách tiết kiệm:</td>
                        <td className="px-3 py-2 text-right text-green-600 font-bold">
                          {(Number(detail.totalComponentRetailPrice) - Number(detail.sellPrice)).toLocaleString('vi-VN')} ₫
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
