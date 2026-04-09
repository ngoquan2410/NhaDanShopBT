import { useState, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { customerService } from '../../services/customerService'
import { useCustomers, useCustomerMutations } from '../../hooks/useCustomers'
import { invoiceService } from '../../services/invoiceService'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'

// ── Hằng nhóm khách hàng ─────────────────────────────────────────────────────
const GROUPS = [
  { value: 'RETAIL',    label: 'Khách lẻ',  color: 'bg-green-100 text-green-700' },
  { value: 'WHOLESALE', label: 'Khách sỉ',  color: 'bg-blue-100 text-blue-700' },
  { value: 'VIP',       label: 'VIP',        color: 'bg-amber-100 text-amber-700' },
]
const GROUP_MAP = Object.fromEntries(GROUPS.map(g => [g.value, g]))

function GroupBadge({ group }) {
  const g = GROUP_MAP[group] || GROUP_MAP.RETAIL
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${g.color}`}>{g.label}</span>
}

const EMPTY_FORM = {
  code: '', name: '', phone: '', address: '', email: '',
  group: 'RETAIL', note: '', active: true,
}

// ── Modal lịch sử mua hàng ───────────────────────────────────────────────────
function InvoiceHistoryModal({ customer, onClose }) {
  const [page, setPage] = useState(0)
  const { data: invPage, isLoading } = useQuery({
    queryKey: ['customer-invoices', customer.id, page],
    queryFn: () => invoiceService.getByCustomer(customer.id, page),
    keepPreviousData: true,
  })

  const invoices = invPage?.content || []
  const totalPages = invPage?.totalPages || 1

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">📋 Lịch sử mua hàng</h3>
            <p className="text-sm text-gray-500">{customer.name} ({customer.code})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {/* Thống kê nhanh */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{invPage?.totalElements || 0}</p>
              <p className="text-xs text-blue-500">Tổng hóa đơn</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">
                {Number(customer.totalSpend || 0).toLocaleString('vi-VN')} ₫
              </p>
              <p className="text-xs text-green-500">Tổng chi tiêu</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <GroupBadge group={customer.group} />
              <p className="text-xs text-amber-500 mt-1">Nhóm khách</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Đang tải...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-8 text-gray-400">Chưa có hóa đơn nào</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <th className="px-3 py-2 text-left">Số HĐ</th>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-right">Tổng tiền</th>
                  <th className="px-3 py-2 text-right">Giảm giá</th>
                  <th className="px-3 py-2 text-right font-semibold">Thực trả</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.id} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 font-mono text-blue-600 font-semibold">{inv.invoiceNo}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {dayjs(inv.invoiceDate).format('DD/MM/YYYY HH:mm')}
                    </td>
                    <td className="px-3 py-2 text-right">{Number(inv.totalAmount).toLocaleString('vi-VN')} ₫</td>
                    <td className="px-3 py-2 text-right text-orange-600">
                      {Number(inv.discountAmount) > 0
                        ? `-${Number(inv.discountAmount).toLocaleString('vi-VN')} ₫`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-green-700">
                      {Number(inv.finalAmount).toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">← Trước</button>
              <span className="text-sm text-gray-500">Trang {page + 1}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">Sau →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Trang chính Customers ────────────────────────────────────────────────────
export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [historyCustomer, setHistoryCustomer] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef(null)

  const { data: customers = [], isLoading } = useCustomers(debouncedSearch || undefined)
  const { create, update, remove } = useCustomerMutations()

  const handleSearch = useCallback((val) => {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 300)
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openCreate = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (c) => {
    setEditItem(c)
    setForm({
      code: c.code || '', name: c.name || '', phone: c.phone || '',
      address: c.address || '', email: c.email || '',
      group: c.group || 'RETAIL', note: c.note || '', active: c.active ?? true,
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.code.trim()) { toast.error('Mã KH không được để trống'); return }
    if (!form.name.trim()) { toast.error('Tên KH không được để trống'); return }
    setSaving(true)
    try {
      if (editItem) {
        await update.mutateAsync({ id: editItem.id, data: form })
      } else {
        await create.mutateAsync(form)
      }
      setShowModal(false)
    } catch { /* toast shown by hook */ }
    finally { setSaving(false) }
  }

  const handleDelete = async (c) => {
    if (!confirm(`Vô hiệu hoá khách hàng "${c.name}"?`)) return
    remove.mutate(c.id)
  }

  // Thống kê nhanh
  const totalCustomers = customers.length
  const vipCount = customers.filter(c => c.group === 'VIP').length
  const totalSpend = customers.reduce((s, c) => s + Number(c.totalSpend || 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">👤 Khách hàng</h2>
        <button onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
          + Thêm KH
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-700">{totalCustomers}</p>
          <p className="text-xs text-blue-500 mt-0.5">Khách hàng đang hoạt động</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-amber-700">{vipCount}</p>
          <p className="text-xs text-amber-500 mt-0.5">Khách VIP</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-700">{totalSpend.toLocaleString('vi-VN')} ₫</p>
          <p className="text-xs text-green-500 mt-0.5">Tổng chi tiêu tích lũy</p>
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => handleSearch(e.target.value)}
        placeholder="🔍 Tìm theo tên, mã KH, SĐT..."
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Đang tải...</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {debouncedSearch ? `Không tìm thấy KH với từ khoá "${debouncedSearch}"` : 'Chưa có khách hàng nào.'}
            {!debouncedSearch && (
              <> <button onClick={openCreate} className="text-blue-600 underline ml-1">Thêm ngay</button></>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Mã KH</th>
                  <th className="px-4 py-3 text-left">Tên khách hàng</th>
                  <th className="px-4 py-3 text-left">SĐT</th>
                  <th className="px-4 py-3 text-center">Nhóm</th>
                  <th className="px-4 py-3 text-right">Tổng chi tiêu</th>
                  <th className="px-4 py-3 text-left">Ghi chú</th>
                  <th className="px-4 py-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2 font-mono font-semibold text-blue-700">{c.code}</td>
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-gray-600">{c.phone || '—'}</td>
                    <td className="px-4 py-2 text-center"><GroupBadge group={c.group} /></td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">
                      {Number(c.totalSpend || 0).toLocaleString('vi-VN')} ₫
                    </td>
                    <td className="px-4 py-2 text-gray-500 max-w-[150px] truncate">{c.note || '—'}</td>
                    <td className="px-4 py-2 text-center space-x-2">
                      <button onClick={() => setHistoryCustomer(c)}
                        className="text-blue-500 hover:underline text-xs font-medium">📋 HĐ</button>
                      <button onClick={() => openEdit(c)}
                        className="text-indigo-600 hover:underline text-xs font-medium">Sửa</button>
                      <button onClick={() => handleDelete(c)}
                        className="text-red-500 hover:underline text-xs font-medium">Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal CRUD */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">{editItem ? '✏️ Sửa khách hàng' : '+ Thêm khách hàng mới'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mã KH *</label>
                  <input value={form.code}
                    onChange={e => set('code', e.target.value.toUpperCase())}
                    placeholder="VD: KH001"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tên KH *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="Tên đầy đủ"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">SĐT</label>
                  <input value={form.phone} onChange={e => set('phone', e.target.value)}
                    placeholder="0901234567"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                  <input value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="kh@email.com" type="email"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nhóm khách hàng</label>
                  <select value={form.group} onChange={e => set('group', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {GROUPS.map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Trạng thái</label>
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" id="cust-active"
                      checked={form.active} onChange={e => set('active', e.target.checked)} />
                    <label htmlFor="cust-active" className="text-sm">Đang hoạt động</label>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Địa chỉ</label>
                <input value={form.address} onChange={e => set('address', e.target.value)}
                  placeholder="Số nhà, đường, quận/huyện, tỉnh/thành"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
                <textarea value={form.note} onChange={e => set('note', e.target.value)}
                  rows={2} placeholder="Thông tin thêm về khách hàng..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border rounded-lg py-2 text-gray-600 hover:bg-gray-50 text-sm">Hủy</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 font-semibold text-sm hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal lịch sử mua hàng */}
      {historyCustomer && (
        <InvoiceHistoryModal
          customer={historyCustomer}
          onClose={() => setHistoryCustomer(null)}
        />
      )}
    </div>
  )
}
