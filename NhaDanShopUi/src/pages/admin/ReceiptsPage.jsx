import { useState } from 'react'
import { useReceipts, useReceiptMutations } from '../../hooks/useReceipts'
import { useProducts } from '../../hooks/useProducts'
import { useSort } from '../../hooks/useSort'
import dayjs from 'dayjs'

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

function ReceiptForm({ products, onSubmit, loading }) {
  const [supplierName, setSupplierName] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState([{ productId: '', quantity: 1, unitCost: 0 }])

  const addItem = () => setItems(i => [...i, { productId: '', quantity: 1, unitCost: 0 }])
  const removeItem = (idx) => setItems(i => i.filter((_, j) => j !== idx))
  const setItem = (idx, key, val) =>
    setItems(i => i.map((it, j) => j === idx ? { ...it, [key]: val } : it))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      supplierName,
      note,
      items: items.map(it => ({
        productId: Number(it.productId),
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
      })),
    })
  }

  const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitCost), 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung c��p</label>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Tên nhà cung cấp" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
          <input value={note} onChange={e => setNote(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Ghi chú (tùy ch��n)" />
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-700">Chi tiết nhập hàng</h4>
          <button type="button" onClick={addItem}
            className="text-green-600 hover:text-green-700 text-sm font-medium">+ Thêm dòng</button>
        </div>
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 mb-2 items-end">
            <div className="flex-1">
              {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Sản phẩm *</label>}
              <select
                value={item.productId}
                onChange={e => setItem(idx, 'productId', e.target.value)}
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">-- Chọn sản phẩm --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Số lượng</label>}
              <input type="number" min={1} value={item.quantity}
                onChange={e => setItem(idx, 'quantity', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="w-32">
              {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Giá nhập (₫)</label>}
              <input type="number" min={0} step={100} value={item.unitCost}
                onChange={e => setItem(idx, 'unitCost', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <button type="button" onClick={() => removeItem(idx)}
              className="text-red-500 hover:text-red-700 pb-2 text-lg">&times;</button>
          </div>
        ))}
        <div className="text-right mt-3 font-semibold text-green-700">
          Tổng tiền nhập: {total.toLocaleString('vi-VN')} ₫
        </div>
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

export default function ReceiptsPage() {
  const [page, setPage] = useState(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [detail, setDetail] = useState(null)

  const { data, isLoading } = useReceipts(page, from || undefined, to || undefined)
  const { data: products = [] } = useProducts()
  const { create, remove } = useReceiptMutations()

  const receipts = data?.content || []
  const totalPages = data?.totalPages || 1
  const { sorted: sortedReceipts, SortHeader } = useSort(receipts, 'receiptDate', 'desc')

  const handleCreate = async (formData) => {
    await create.mutateAsync(formData)
    setShowModal(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Phiếu Nhập Kho</h2>
        <button onClick={() => setShowModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          + Tạo phiếu nhập
        </button>
      </div>

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
                <SortHeader field="receiptNo" className="text-left px-4 py-3">Số phiếu</SortHeader>
                <SortHeader field="supplierName" className="text-left px-4 py-3">Nhà cung cấp</SortHeader>
                <SortHeader field="receiptDate" className="text-left px-4 py-3">Ngày nhập</SortHeader>
                <SortHeader field="totalAmount" className="text-right px-4 py-3">Tổng tiền</SortHeader>
                <th className="text-left px-4 py-3">Ghi chú</th>
                <th className="text-center px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
              ) : sortedReceipts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Chưa có phiếu nhập</td></tr>
              ) : sortedReceipts.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-mono text-blue-600 cursor-pointer hover:underline"
                    onClick={() => setDetail(r)}>{r.receiptNo}</td>
                  <td className="px-4 py-3">{r.supplierName || '—'}</td>
                  <td className="px-4 py-3">{dayjs(r.receiptDate).format('DD/MM/YYYY HH:mm')}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-700">
                    {Number(r.totalAmount).toLocaleString('vi-VN')} ₫
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.note || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => { if (window.confirm('Xóa phiếu nhập này?')) remove.mutate(r.id) }}
                      className="text-red-600 hover:text-red-800 text-xs">🗑️ Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">← Trước</button>
          <span className="text-sm text-gray-500">Trang {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">Sau →</button>
        </div>
      </div>

      {/* Create modal */}
      {showModal && (
        <Modal title="Tạo phiếu nhập kho" onClose={() => setShowModal(false)}>
          <ReceiptForm products={products} onSubmit={handleCreate} loading={create.isLoading} />
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
                {detail.items?.map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{it.productName}</td>
                    <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-2 text-right">{Number(it.unitCost).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2 text-right font-medium">{Number(it.quantity * it.unitCost).toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 font-semibold text-right">Tổng cộng:</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">
                    {Number(detail.totalAmount).toLocaleString('vi-VN')} ₫
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
