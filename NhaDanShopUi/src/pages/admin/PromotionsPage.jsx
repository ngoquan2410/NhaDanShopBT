import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { promotionService } from '../../services/promotionService'
import { useCategories } from '../../hooks/useCategories'
import { useProducts } from '../../hooks/useProducts'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'

const PROMOTION_TYPES = [
  { value: 'PERCENT_DISCOUNT', label: '% Chiết khấu (Giảm %)', icon: '🏷️' },
  { value: 'FIXED_DISCOUNT',   label: 'Giảm tiền cố định',     icon: '💵' },
  { value: 'BUY_X_GET_Y',      label: 'Mua X tặng Y (combo)',  icon: '🎁' },
  { value: 'QUANTITY_GIFT',    label: 'Mua min-max → Tặng SP', icon: '🎀' },
  { value: 'FREE_SHIPPING',    label: 'Miễn phí vận chuyển',   icon: '🚚' },
]

const APPLIES_TO = [
  { value: 'ALL',      label: 'Tất cả sản phẩm' },
  { value: 'CATEGORY', label: 'Theo danh mục'   },
  { value: 'PRODUCT',  label: 'Sản phẩm cụ thể' },
]

function statusBadge(p) {
  if (!p.active) return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 font-medium">Tắt</span>
  if (p.currentlyActive) return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium animate-pulse">● Đang chạy</span>
  const now = new Date()
  if (new Date(p.startDate) > now) return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">Sắp diễn ra</span>
  return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600 font-medium">Đã kết thúc</span>
}

function typeLabel(type) {
  return PROMOTION_TYPES.find(t => t.value === type) || { label: type, icon: '🏷️' }
}

function discountDisplay(p) {
  if (p.type === 'PERCENT_DISCOUNT') return `${p.discountValue}%`
  if (p.type === 'FIXED_DISCOUNT')   return `${Number(p.discountValue).toLocaleString('vi-VN')} ₫`
  if (p.type === 'FREE_SHIPPING')    return 'Miễn phí ship'
  if (p.type === 'BUY_X_GET_Y') {
    const gift = p.getProductName || `SP #${p.getProductId}`
    return `Mua ${p.buyQty ?? '?'} → Tặng ${p.getQty ?? '?'} ${gift}`
  }
  return p.discountValue
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  name: '', description: '', type: 'PERCENT_DISCOUNT',
  discountValue: '', minOrderValue: 0, maxDiscount: '',
  startDate: dayjs().format('YYYY-MM-DDTHH:mm'),
  endDate: dayjs().add(30, 'day').format('YYYY-MM-DDTHH:mm'),
  active: true, appliesTo: 'ALL', categoryIds: [], productIds: [],
  buyQty: '', getProductId: '', getQty: '',
  minBuyQty: '', maxBuyQty: '',
}

function PromotionForm({ initial, categories, products, onSubmit, loading, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleId = (key, id) => {
    setForm(f => {
      const arr = f[key] || []
      return { ...f, [key]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...form,
      discountValue: Number(form.discountValue) || 0,
      minOrderValue: Number(form.minOrderValue) || 0,
      maxDiscount: form.maxDiscount !== '' ? Number(form.maxDiscount) : null,
      buyQty:       form.buyQty !== ''       ? Number(form.buyQty)       : null,
      getProductId: form.getProductId !== '' ? Number(form.getProductId) : null,
      getQty:       form.getQty !== ''       ? Number(form.getQty)       : null,
      minBuyQty:    form.minBuyQty !== ''    ? Number(form.minBuyQty)    : null,
      maxBuyQty:    form.maxBuyQty !== ''    ? Number(form.maxBuyQty)    : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên chương trình *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="VD: Khuyến mãi hè 2026"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Chi tiết điều kiện áp dụng..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
        </div>

        {/* Loại */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Loại khuyến mãi *</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
            {PROMOTION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>

        {/* Giá trị giảm */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {form.type === 'PERCENT_DISCOUNT' ? 'Giảm (%)' :
             form.type === 'FIXED_DISCOUNT'   ? 'Giảm (₫)' : 'Giá trị'}
          </label>
          <input type="number" min={0} max={form.type === 'PERCENT_DISCOUNT' ? 100 : undefined}
            step={form.type === 'PERCENT_DISCOUNT' ? 0.1 : 100}
            value={form.discountValue} onChange={e => set('discountValue', e.target.value)}
            placeholder={form.type === 'PERCENT_DISCOUNT' ? '10' : '50000'}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>

        {/* Đơn hàng tối thiểu */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Đơn hàng tối thiểu (₫)</label>
          <input type="number" min={0} step={1000} value={form.minOrderValue}
            onChange={e => set('minOrderValue', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>

        {/* Giảm tối đa (với PERCENT_DISCOUNT) */}
        {form.type === 'PERCENT_DISCOUNT' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Giảm tối đa (₫, để trống = không giới hạn)</label>
            <input type="number" min={0} step={1000} value={form.maxDiscount}
              onChange={e => set('maxDiscount', e.target.value)}
              placeholder="Không giới hạn"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        )}

        {/* Ngày bắt đầu / kết thúc */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu *</label>
          <input type="datetime-local" value={form.startDate} onChange={e => set('startDate', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc *</label>
          <input type="datetime-local" value={form.endDate} onChange={e => set('endDate', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
      </div>

      {/* ── BUY_X_GET_Y: Combo mua X tặng Y ── */}
      {form.type === 'BUY_X_GET_Y' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-amber-800 text-sm">🎁 Cấu hình Mua X Tặng Y</p>
          <p className="text-xs text-amber-600">
            Ví dụ: Mua 2 Bánh Tráng Rong Biển → Tặng 1 Muối Ớt
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sản phẩm cần mua (áp dụng từ "Áp dụng cho" phía dưới)
              </label>
              <p className="text-xs text-gray-500 bg-white rounded p-2 border">
                Cấu hình ở mục "Áp dụng cho" → chọn sản phẩm/danh mục mà khách cần mua đủ số lượng X
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mua tối thiểu (X) *</label>
              <input type="number" min={1} step={1} value={form.buyQty}
                onChange={e => set('buyQty', e.target.value)}
                placeholder="VD: 2"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sản phẩm được tặng (Y) *</label>
              <select value={form.getProductId} onChange={e => set('getProductId', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">-- Chọn sản phẩm tặng --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số lượng tặng (Y) *</label>
              <input type="number" min={1} step={1} value={form.getQty}
                onChange={e => set('getQty', e.target.value)}
                placeholder="VD: 1"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          {form.buyQty && form.getProductId && form.getQty && (
            <div className="bg-white rounded-lg p-2 text-xs text-amber-700 border border-amber-200">
              📋 Tóm tắt: Mua {form.buyQty} sản phẩm đủ điều kiện →
              Tặng {form.getQty} {products.find(p => String(p.id) === String(form.getProductId))?.name || '...'}
            </div>
          )}
        </div>
      )}

      {/* ── QUANTITY_GIFT: Mua min-max → tặng SP ── */}
      {form.type === 'QUANTITY_GIFT' && (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-pink-800 text-sm">🎀 Cấu hình Mua Min–Max → Tặng Sản Phẩm</p>
          <p className="text-xs text-pink-600">
            Ví dụ: Mua từ 5 đến 10 hộp → Tặng 1 gói Muối Ớt miễn phí
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mua tối thiểu (sp) *</label>
              <input type="number" min={1} step={1} value={form.minBuyQty}
                onChange={e => set('minBuyQty', e.target.value)}
                placeholder="VD: 5"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Mua tối đa (sp)
                <span className="ml-1 text-gray-400 font-normal">(để trống = không giới hạn)</span>
              </label>
              <input type="number" min={1} step={1} value={form.maxBuyQty}
                onChange={e => set('maxBuyQty', e.target.value)}
                placeholder="Không giới hạn"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Sản phẩm được tặng *</label>
              <select value={form.getProductId} onChange={e => set('getProductId', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none">
                <option value="">-- Chọn sản phẩm tặng --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Số lượng tặng *</label>
              <input type="number" min={1} step={1} value={form.getQty}
                onChange={e => set('getQty', e.target.value)}
                placeholder="VD: 1"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none" />
            </div>
          </div>
          {form.minBuyQty && form.getProductId && form.getQty && (
            <div className="bg-white rounded-lg p-2 text-xs text-pink-700 border border-pink-200">
              📋 Tóm tắt: Mua từ {form.minBuyQty}{form.maxBuyQty ? `–${form.maxBuyQty}` : '+'} sản phẩm đủ điều kiện
              → Tặng {form.getQty} {products.find(p => String(p.id) === String(form.getProductId))?.name || '...'}
            </div>
          )}
        </div>
      )}

      {/* Phạm vi áp dụng */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Áp dụng cho</label>
        <select value={form.appliesTo} onChange={e => set('appliesTo', e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
          {APPLIES_TO.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      {/* Danh mục */}
      {form.appliesTo === 'CATEGORY' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Chọn danh mục áp dụng</label>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
            {categories.map(c => (
              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-amber-50 p-1 rounded">
                <input type="checkbox" checked={(form.categoryIds || []).includes(c.id)}
                  onChange={() => toggleId('categoryIds', c.id)}
                  className="rounded border-gray-300 text-amber-500" />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Sản phẩm */}
      {form.appliesTo === 'PRODUCT' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Chọn sản phẩm áp dụng</label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
            {products.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-amber-50 p-1 rounded">
                <input type="checkbox" checked={(form.productIds || []).includes(p.id)}
                  onChange={() => toggleId('productIds', p.id)}
                  className="rounded border-gray-300 text-amber-500" />
                <span className="truncate">{p.code} - {p.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <div className={`relative w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}
            onClick={() => set('active', !form.active)}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {form.active ? 'Kích hoạt ngay' : 'Tạm tắt'}
          </span>
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onClose}
          className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Hủy</button>
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-60 font-semibold">
          {loading ? 'Đang lưu...' : '💾 Lưu'}
        </button>
      </div>
    </form>
  )
}

export default function PromotionsPage() {
  const [page, setPage] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['promotions', page],
    queryFn: () => promotionService.getAll(page, 20),
  })

  const { data: categories = [] } = useCategories()
  const { data: products = [] } = useProducts()

  const promotions = data?.content || []
  const totalPages = data?.totalPages || 1

  const filtered = promotions.filter(p => {
    if (filterStatus === 'active') return p.currentlyActive
    if (filterStatus === 'inactive') return !p.active
    if (filterStatus === 'scheduled') return p.active && !p.currentlyActive && new Date(p.startDate) > new Date()
    return true
  })

  const createMutation = useMutation({
    mutationFn: promotionService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      setShowCreate(false)
      toast.success('Tạo khuyến mãi thành công!')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Lỗi tạo khuyến mãi'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => promotionService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      setEditing(null)
      toast.success('Cập nhật thành công!')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Lỗi cập nhật'),
  })

  const toggleMutation = useMutation({
    mutationFn: promotionService.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['promotions'] }),
    onError: () => toast.error('Lỗi thay đổi trạng thái'),
  })

  const deleteMutation = useMutation({
    mutationFn: promotionService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] })
      toast.success('Đã xóa khuyến mãi')
    },
    onError: () => toast.error('Lỗi xóa khuyến mãi'),
  })

  const handleDelete = (p) => {
    if (window.confirm(`Xóa chương trình "${p.name}"?`)) {
      deleteMutation.mutate(p.id)
    }
  }

  const toEditForm = (p) => ({
    name: p.name,
    description: p.description || '',
    type: p.type,
    discountValue: p.discountValue,
    minOrderValue: p.minOrderValue,
    maxDiscount: p.maxDiscount ?? '',
    startDate: dayjs(p.startDate).format('YYYY-MM-DDTHH:mm'),
    endDate: dayjs(p.endDate).format('YYYY-MM-DDTHH:mm'),
    active: p.active,
    appliesTo: p.appliesTo,
    categoryIds: p.categoryIds || [],
    productIds: p.productIds || [],
    // BUY_X_GET_Y
    buyQty: p.buyQty ?? '', getProductId: p.getProductId ?? '', getQty: p.getQty ?? '',
    minBuyQty: p.minBuyQty ?? '', maxBuyQty: p.maxBuyQty ?? '',
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🎉 Quản lý Khuyến mãi</h2>
          <p className="text-sm text-gray-500 mt-0.5">Tạo & quản lý các chương trình ưu đãi cho khách hàng</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-amber-500 text-white px-5 py-2.5 rounded-lg hover:bg-amber-600 font-semibold flex items-center gap-2 shadow">
          + Tạo khuyến mãi
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tổng chương trình', value: data?.totalElements ?? '...', color: 'blue', icon: '📋' },
          { label: 'Đang chạy',        value: promotions.filter(p => p.currentlyActive).length, color: 'green', icon: '▶️' },
          { label: 'Sắp diễn ra',      value: promotions.filter(p => p.active && !p.currentlyActive && new Date(p.startDate) > new Date()).length, color: 'amber', icon: '⏰' },
          { label: 'Đã tắt',           value: promotions.filter(p => !p.active).length, color: 'gray', icon: '⏸️' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow p-4">
        <div className="flex gap-2 flex-wrap">
          {[
            { k: 'all',       label: 'Tất cả' },
            { k: 'active',    label: '● Đang chạy' },
            { k: 'scheduled', label: '⏰ Sắp diễn ra' },
            { k: 'inactive',  label: '⏸ Đã tắt' },
          ].map(({ k, label }) => (
            <button key={k} onClick={() => setFilterStatus(k)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                filterStatus === k ? 'bg-amber-500 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-5xl mb-3">🎉</div>
            <p className="font-medium text-gray-500">Chưa có chương trình khuyến mãi nào</p>
            <button onClick={() => setShowCreate(true)}
              className="mt-4 text-amber-600 hover:text-amber-700 text-sm font-medium underline">
              + Tạo ngay
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 border-b text-gray-600 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Chương trình</th>
                  <th className="text-left px-4 py-3">Loại</th>
                  <th className="text-center px-4 py-3">Giá trị giảm</th>
                  <th className="text-left px-4 py-3">Thời gian</th>
                  <th className="text-left px-4 py-3">Áp dụng</th>
                  <th className="text-center px-4 py-3">Trạng thái</th>
                  <th className="text-center px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => {
                  const t = typeLabel(p.type)
                  return (
                    <tr key={p.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{p.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                          {t.icon} {t.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-amber-600 text-base">{discountDisplay(p)}</span>
                        {p.minOrderValue > 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">Đơn từ {Number(p.minOrderValue).toLocaleString('vi-VN')} ₫</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600">{dayjs(p.startDate).format('DD/MM/YYYY HH:mm')}</p>
                        <p className="text-xs text-gray-400">→ {dayjs(p.endDate).format('DD/MM/YYYY HH:mm')}</p>
                      </td>
                      <td className="px-4 py-3">
                        {p.appliesTo === 'ALL' && <span className="text-xs text-gray-500">Tất cả</span>}
                        {p.appliesTo === 'CATEGORY' && (
                          <div className="text-xs text-gray-500">
                            <span>Danh mục ({p.categoryNames?.length ?? 0})</span>
                            {p.categoryNames?.slice(0, 2).map(n => (
                              <span key={n} className="ml-1 bg-gray-100 px-1.5 py-0.5 rounded text-xs">{n}</span>
                            ))}
                          </div>
                        )}
                        {p.appliesTo === 'PRODUCT' && (
                          <div className="text-xs text-gray-500">
                            <span>SP ({p.productNames?.length ?? 0})</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{statusBadge(p)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {/* Bật / Tắt */}
                          <button
                            onClick={() => toggleMutation.mutate(p.id)}
                            title={p.active ? 'Tắt khuyến mãi' : 'Bật khuyến mãi'}
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                              p.active
                                ? 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                                : 'bg-green-100 text-green-600 hover:bg-green-200'
                            }`}>
                            {p.active ? '⏸' : '▶'}
                          </button>
                          {/* Sửa */}
                          <button onClick={() => setEditing({ id: p.id, form: toEditForm(p) })}
                            className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-600 hover:bg-blue-200 font-medium">
                            ✏️
                          </button>
                          {/* Xóa */}
                          <button onClick={() => handleDelete(p)}
                            className="px-2 py-1 text-xs rounded bg-red-100 text-red-500 hover:bg-red-200 font-medium">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-4 border-t">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">‹ Trước</button>
            <span className="text-sm text-gray-600">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Sau ›</button>
          </div>
        )}
      </div>

      {/* Modal: Tạo mới */}
      {showCreate && (
        <Modal title="🎉 Tạo chương trình khuyến mãi" onClose={() => setShowCreate(false)} wide>
          <PromotionForm
            categories={categories}
            products={products}
            loading={createMutation.isPending}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)}
          />
        </Modal>
      )}

      {/* Modal: Chỉnh sửa */}
      {editing && (
        <Modal title="✏️ Chỉnh sửa khuyến mãi" onClose={() => setEditing(null)} wide>
          <PromotionForm
            initial={editing.form}
            categories={categories}
            products={products}
            loading={updateMutation.isPending}
            onClose={() => setEditing(null)}
            onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })}
          />
        </Modal>
      )}
    </div>
  )
}
