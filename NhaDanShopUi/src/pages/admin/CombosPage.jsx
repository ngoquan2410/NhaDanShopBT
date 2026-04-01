import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { comboService } from '../../services/comboService'
import { useProducts } from '../../hooks/useProducts'
import toast from 'react-hot-toast'

/**
 * Trang quản lý Combo sản phẩm
 *
 * Thiết kế:
 * - 1 combo = nhiều sản phẩm thành phần (ProductComboItem)
 * - Khi NHẬP kho theo combo: chọn combo → hệ thống expand thành từng dòng SP,
 *   chi phí phân bổ tỷ lệ theo qty thành phần
 * - Khi BÁN theo combo: chọn combo → expand thành từng line item hóa đơn,
 *   giá bán = sellPrice combo (thường thấp hơn tổng từng SP → khuyến mãi bundle)
 */

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function ComboForm({ initial, products, onSubmit, loading, onClose }) {
  const [form, setForm] = useState(initial || {
    code: '', name: '', description: '', sellPrice: '', active: true, items: [],
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addItem = () => setForm(f => ({
    ...f,
    items: [...(f.items || []), { productId: '', quantity: 1 }]
  }))
  const removeItem = (idx) => setForm(f => ({
    ...f,
    items: f.items.filter((_, i) => i !== idx)
  }))
  const setItem = (idx, key, val) => setForm(f => ({
    ...f,
    items: f.items.map((it, i) => i === idx ? { ...it, [key]: val } : it)
  }))

  // Tính tổng giá bán lẻ từng thành phần (để so sánh)
  const totalRetail = (form.items || []).reduce((s, it) => {
    const p = products.find(p => String(p.id) === String(it.productId))
    return s + (p ? Number(p.sellPrice) * Number(it.quantity) : 0)
  }, 0)
  const saving = totalRetail - (Number(form.sellPrice) || 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.items?.length) { toast.error('Combo phải có ít nhất 1 sản phẩm'); return }
    const validItems = form.items.filter(it => it.productId && Number(it.quantity) > 0)
    if (!validItems.length) { toast.error('Chọn sản phẩm và số lượng cho từng thành phần'); return }
    onSubmit({
      code: form.code?.trim() || null,
      name: form.name,
      description: form.description,
      sellPrice: Number(form.sellPrice) || 0,
      active: form.active,
      items: validItems.map(it => ({
        productId: Number(it.productId),
        quantity: Number(it.quantity),
      }))
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mã combo
            <span className="ml-1 text-xs text-gray-400 font-normal">(để trống → tự động tạo)</span>
          </label>
          <input value={form.code} onChange={e => set('code', e.target.value)}
            placeholder="VD: COMBO001"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên combo *</label>
          <input required value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="VD: Combo Bánh Tráng Đặc Biệt"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
          <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Mô tả chi tiết combo..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Giá bán combo (₫) *
            {totalRetail > 0 && (
              <span className="ml-2 text-xs text-gray-400 font-normal">
                (tổng lẻ: {totalRetail.toLocaleString('vi-VN')} ₫)
              </span>
            )}
          </label>
          <input required type="number" min={0} step={1000} value={form.sellPrice}
            onChange={e => set('sellPrice', e.target.value)}
            placeholder="VD: 150000"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          {saving > 0 && (
            <p className="text-xs text-green-600 mt-1">
              ✅ Khách tiết kiệm: {saving.toLocaleString('vi-VN')} ₫ so với mua lẻ
            </p>
          )}
          {saving < 0 && (
            <p className="text-xs text-orange-500 mt-1">
              ⚠️ Giá combo cao hơn tổng giá lẻ {Math.abs(saving).toLocaleString('vi-VN')} ₫
            </p>
          )}
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className={`relative w-10 h-5 rounded-full transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-300'}`}
              onClick={() => set('active', !form.active)}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm font-medium text-gray-700">{form.active ? 'Đang hoạt động' : 'Tạm tắt'}</span>
          </label>
        </div>
      </div>

      {/* Thành phần combo */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-700">📦 Thành phần combo</h4>
          <button type="button" onClick={addItem}
            className="text-purple-600 hover:text-purple-700 text-sm font-medium">
            + Thêm sản phẩm
          </button>
        </div>

        {(form.items || []).length === 0 && (
          <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-sm">Chưa có sản phẩm nào trong combo</p>
            <button type="button" onClick={addItem}
              className="mt-2 text-purple-600 text-sm font-medium hover:underline">
              + Thêm ngay
            </button>
          </div>
        )}

        {(form.items || []).map((item, idx) => {
          const p = products.find(p => String(p.id) === String(item.productId))
          const lineTotal = p ? Number(p.sellPrice) * Number(item.quantity) : 0
          return (
            <div key={idx} className="flex gap-2 mb-2 items-end">
              <div className="flex-1">
                {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sản phẩm *</label>}
                <select value={item.productId} onChange={e => setItem(idx, 'productId', e.target.value)}
                  required className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({Number(p.sellPrice).toLocaleString('vi-VN')} ₫/{p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Số lượng</label>}
                <input type="number" min={1} value={item.quantity}
                  onChange={e => setItem(idx, 'quantity', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="w-32 text-right pb-2 text-sm text-gray-600">
                {p ? `${lineTotal.toLocaleString('vi-VN')} ₫` : '—'}
              </div>
              <button type="button" onClick={() => removeItem(idx)}
                className="text-red-500 hover:text-red-700 pb-2 text-lg">&times;</button>
            </div>
          )
        })}

        {(form.items || []).length > 0 && totalRetail > 0 && (
          <div className="mt-3 bg-purple-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tổng giá bán lẻ từng SP:</span>
              <span className="font-medium">{totalRetail.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div className="flex justify-between text-purple-700 font-bold border-t mt-1.5 pt-1.5">
              <span>Giá combo:</span>
              <span>{Number(form.sellPrice || 0).toLocaleString('vi-VN')} ₫</span>
            </div>
            {saving > 0 && (
              <div className="flex justify-between text-green-600 text-xs mt-1">
                <span>Khách tiết kiệm:</span>
                <span>{saving.toLocaleString('vi-VN')} ₫ ({Math.round(saving / totalRetail * 100)}%)</span>
              </div>
            )}
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

export default function CombosPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)
  const queryClient = useQueryClient()
  const { data: products = [] } = useProducts()

  const { data: combos = [], isLoading } = useQuery({
    queryKey: ['combos'],
    queryFn: comboService.getAll,
  })

  const createMutation = useMutation({
    mutationFn: comboService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combos'] })
      setShowCreate(false)
      toast.success('Tạo combo thành công!')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Lỗi tạo combo'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => comboService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combos'] })
      setEditing(null)
      toast.success('Cập nhật combo thành công!')
    },
    onError: (e) => toast.error(e?.response?.data?.detail || 'Lỗi cập nhật combo'),
  })

  const toggleMutation = useMutation({
    mutationFn: comboService.toggle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['combos'] }),
    onError: () => toast.error('Lỗi thay đổi trạng thái'),
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
    code: c.code,
    name: c.name,
    description: c.description || '',
    sellPrice: c.sellPrice,
    active: c.active,
    items: c.items.map(it => ({ productId: String(it.productId), quantity: it.quantity })),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">📦 Quản lý Combo</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Tạo combo sản phẩm để nhập kho và bán hàng theo gói
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="bg-purple-600 text-white px-5 py-2.5 rounded-lg hover:bg-purple-700 font-semibold flex items-center gap-2 shadow">
          + Tạo combo mới
        </button>
      </div>

      {/* Hướng dẫn thiết kế combo */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-semibold text-purple-800 mb-1">📥 Nhập kho theo combo</p>
          <p className="text-purple-600 text-xs">
            Trong phiếu nhập kho → chọn "Nhập theo combo" → chọn combo + số lượng combo + giá nhập/combo.
            Hệ thống tự expand từng SP thành phần, phân bổ chi phí theo tỷ lệ số lượng.
          </p>
        </div>
        <div>
          <p className="font-semibold text-purple-800 mb-1">🧾 Bán theo combo</p>
          <p className="text-purple-600 text-xs">
            Trong hóa đơn bán hàng → chọn "Thêm combo" → hệ thống expand từng SP thành line item.
            Giá bán = giá combo (thường thấp hơn tổng lẻ để khuyến mãi bundle).
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Tổng combo', value: combos.length, color: 'purple', icon: '📦' },
          { label: 'Đang hoạt động', value: combos.filter(c => c.active).length, color: 'green', icon: '✅' },
          { label: 'Tạm tắt', value: combos.filter(c => !c.active).length, color: 'gray', icon: '⏸️' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
            <span className="text-3xl">{icon}</span>
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
          <div className="text-6xl mb-4">📦</div>
          <p className="font-medium text-gray-500 text-lg">Chưa có combo nào</p>
          <p className="text-sm text-gray-400 mt-1">Tạo combo để nhập kho và bán hàng theo gói</p>
          <button onClick={() => setShowCreate(true)}
            className="mt-4 bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 font-semibold">
            + Tạo combo đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {combos.map(combo => {
            const saving = (combo.totalComponentRetailPrice ?? 0) - Number(combo.sellPrice)
            return (
              <div key={combo.id}
                className={`bg-white rounded-xl shadow border-l-4 ${combo.active ? 'border-purple-500' : 'border-gray-300'} overflow-hidden`}>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">
                          {combo.code}
                        </span>
                        {combo.active
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">Hoạt động</span>
                          : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">Tạm tắt</span>}
                      </div>
                      <h3 className="font-bold text-gray-800 text-base mt-1">{combo.name}</h3>
                      {combo.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{combo.description}</p>
                      )}
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xl font-bold text-purple-700">
                        {Number(combo.sellPrice).toLocaleString('vi-VN')} ₫
                      </p>
                      {combo.totalComponentRetailPrice > 0 && (
                        <p className="text-xs text-gray-400 line-through">
                          {Number(combo.totalComponentRetailPrice).toLocaleString('vi-VN')} ₫ (lẻ)
                        </p>
                      )}
                      {saving > 0 && (
                        <p className="text-xs text-green-600 font-medium">
                          Tiết kiệm {saving.toLocaleString('vi-VN')} ₫ ({Math.round(saving / combo.totalComponentRetailPrice * 100)}%)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Thành phần */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {combo.items.map((item, i) => (
                      <span key={i}
                        className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full">
                        {item.productCode} × {item.quantity}
                        <span className="ml-1 text-purple-500">({item.productName})</span>
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2 border-t pt-3">
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
                          : 'bg-green-100 text-green-600 hover:bg-green-200'
                      }`}>
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

      {/* Modal Tạo */}
      {showCreate && (
        <Modal title="📦 Tạo combo mới" onClose={() => setShowCreate(false)}>
          <ComboForm
            products={products}
            loading={createMutation.isPending}
            onClose={() => setShowCreate(false)}
            onSubmit={(data) => createMutation.mutate(data)}
          />
        </Modal>
      )}

      {/* Modal Sửa */}
      {editing && (
        <Modal title="✏️ Chỉnh sửa combo" onClose={() => setEditing(null)}>
          <ComboForm
            initial={editing.form}
            products={products}
            loading={updateMutation.isPending}
            onClose={() => setEditing(null)}
            onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })}
          />
        </Modal>
      )}

      {/* Modal Chi tiết */}
      {detail && (
        <Modal title={`📦 ${detail.name}`} onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Mã combo</p>
                <p className="font-mono font-bold text-gray-800">{detail.code}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Giá bán combo</p>
                <p className="font-bold text-purple-700 text-base">{Number(detail.sellPrice).toLocaleString('vi-VN')} ₫</p>
              </div>
            </div>
            {detail.description && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{detail.description}</p>
            )}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">📋 Thành phần</h4>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-purple-50 text-xs text-gray-600">
                    <th className="text-left px-3 py-2">Sản phẩm</th>
                    <th className="text-center px-3 py-2">Số lượng</th>
                    <th className="text-right px-3 py-2">Đơn giá lẻ</th>
                    <th className="text-right px-3 py-2">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-purple-600 mr-1">{it.productCode}</span>
                        {it.productName}
                      </td>
                      <td className="px-3 py-2 text-center">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right">{Number(it.unitSellPrice).toLocaleString('vi-VN')} ₫</td>
                      <td className="px-3 py-2 text-right font-medium">{Number(it.lineTotal).toLocaleString('vi-VN')} ₫</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold text-sm">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-gray-600">Tổng giá lẻ:</td>
                    <td className="px-3 py-2 text-right text-gray-700">{Number(detail.totalComponentRetailPrice).toLocaleString('vi-VN')} ₫</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-purple-700 font-bold">Giá combo:</td>
                    <td className="px-3 py-2 text-right text-purple-700 font-bold text-base">{Number(detail.sellPrice).toLocaleString('vi-VN')} ₫</td>
                  </tr>
                  {Number(detail.totalComponentRetailPrice) > Number(detail.sellPrice) && (
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right text-green-600">Khách tiết kiệm:</td>
                      <td className="px-3 py-2 text-right text-green-600">
                        {(Number(detail.totalComponentRetailPrice) - Number(detail.sellPrice)).toLocaleString('vi-VN')} ₫
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
