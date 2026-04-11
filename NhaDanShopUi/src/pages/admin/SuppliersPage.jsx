import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supplierService } from '../../services/supplierService'
import toast from 'react-hot-toast'
import { AdminTable, AdminPageHeader, AdminCard } from '../../components/admin/AdminTable'

const EMPTY_FORM = {
  code: '', name: '', phone: '', address: '', taxCode: '', email: '', note: '', active: true
}

export default function SuppliersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const searchTimer = useRef(null)

  const { data: suppliers = [], isLoading } = useQuery(
    ['suppliers', search],
    () => supplierService.getAll(search || undefined),
    { keepPreviousData: true }
  )

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openCreate = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (s) => {
    setEditItem(s)
    setForm({
      code: s.code || '', name: s.name || '', phone: s.phone || '',
      address: s.address || '', taxCode: s.taxCode || '', email: s.email || '',
      note: s.note || '', active: s.active ?? true
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code.trim()) { toast.error('Mã NCC không được để trống'); return }
    if (!form.name.trim()) { toast.error('Tên NCC không được để trống'); return }
    setLoading(true)
    try {
      if (editItem) {
        await supplierService.update(editItem.id, form)
        toast.success('Đã cập nhật nhà cung cấp')
      } else {
        await supplierService.create(form)
        toast.success('Đã thêm nhà cung cấp')
      }
      qc.invalidateQueries(['suppliers'])
      setShowModal(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi lưu nhà cung cấp')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (s) => {
    if (!confirm(`Vô hiệu hoá NCC "${s.name}"?`)) return
    try {
      await supplierService.delete(s.id)
      toast.success('Đã vô hiệu hoá NCC')
      qc.invalidateQueries(['suppliers'])
    } catch {
      toast.error('Lỗi vô hiệu hoá')
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="🏭 Nhà cung cấp"
        actions={
          <button onClick={openCreate}
            className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-green-700">
            + Thêm NCC
          </button>
        }
      />

      <input value={search}
        onChange={e => { setSearch(e.target.value); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => {}, 300) }}
        placeholder="Tìm theo tên, mã, SĐT..."
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />

      <AdminCard>
        <AdminTable
          loading={isLoading}
          rows={suppliers}
          emptyText="Chưa có nhà cung cấp nào"
          columns={[
            { key: 'code', label: 'Mã', tdClassName: 'font-mono font-semibold text-green-700 text-xs' },
            { key: 'name', label: 'Tên NCC', tdClassName: 'font-medium text-gray-800' },
            { key: 'phone', label: 'SĐT', render: s => s.phone || '—' },
            { key: 'email', label: 'Email', tdClassName: 'text-gray-500 text-xs', render: s => s.email || '—' },
            { key: 'taxCode', label: 'MST', tdClassName: 'text-gray-500 text-xs', render: s => s.taxCode || '—' },
            { key: 'address', label: 'Địa chỉ', tdClassName: 'text-gray-500 text-xs max-w-[180px] truncate', render: s => s.address || '—' },
            { key: 'actions', label: 'Thao tác', isAction: true, thClassName: 'text-center', tdClassName: 'text-center',
              render: s => (
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">Sửa</button>
                  <button onClick={() => handleDelete(s)} className="text-red-500 hover:underline text-xs font-medium px-2 py-1 rounded hover:bg-red-50">Xóa</button>
                </div>
              )},
          ]}
          mobileCard={s => (
            <div>
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">{s.code}</span>
                    {!s.active && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Vô hiệu</span>}
                  </div>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">{s.name}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => openEdit(s)}
                    className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium">Sửa</button>
                  <button onClick={() => handleDelete(s)}
                    className="text-xs bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-medium">Xóa</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                {s.phone && <span>📞 {s.phone}</span>}
                {s.email && <span>✉️ {s.email}</span>}
                {s.address && <span>📍 {s.address}</span>}
              </div>
            </div>
          )}
        />
      </AdminCard>

      {/* Modal — không đổi */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">{editItem ? '✏️ Sửa NCC' : '+ Thêm NCC mới'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mã NCC *</label>
                  <input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="VD: NCC001"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tên NCC *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tên đầy đủ"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">SĐT</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0901234567"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="ncc@example.com" type="email"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mã số thuế</label>
                  <input value={form.taxCode} onChange={e => set('taxCode', e.target.value)} placeholder="MST doanh nghiệp"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Hoạt động</label>
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="sup-active" checked={form.active} onChange={e => set('active', e.target.checked)} />
                    <label htmlFor="sup-active" className="text-sm">Đang hoạt động</label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Địa chỉ</label>
                <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Số nhà, đường, quận, tỉnh/thành"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
                <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} placeholder="Thông tin thêm..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-60">
                  {loading ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm NCC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
