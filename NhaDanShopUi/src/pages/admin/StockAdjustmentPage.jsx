import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { stockAdjustmentService } from '../../services/stockAdjustmentService'
import { productService } from '../../services/productService'
import toast from 'react-hot-toast'
import { AdminTable, AdminPageHeader, AdminCard } from '../../components/admin/AdminTable'
import dayjs from 'dayjs'

const REASONS = [
  { value: 'STOCKTAKE', label: '📋 Kiểm kê định kỳ' },
  { value: 'DAMAGED',   label: '💔 Hàng hư hỏng' },
  { value: 'EXPIRED',   label: '⏰ Hàng hết hạn' },
  { value: 'LOST',      label: '🔍 Thất lạc' },
  { value: 'OTHER',     label: '📝 Lý do khác' },
]

const REASON_LABEL = Object.fromEntries(REASONS.map(r => [r.value, r.label]))

export default function StockAdjustmentPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [detail, setDetail]     = useState(null)
  const [reason, setReason]     = useState('STOCKTAKE')
  const [note, setNote]         = useState('')
  const [adjItems, setAdjItems] = useState([])
  const [searchV, setSearchV]   = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [creating, setCreating] = useState(false)

  const { data: adjPage, isLoading } = useQuery(
    ['stock-adjustments', page],
    () => stockAdjustmentService.getAll(page),
    { keepPreviousData: true }
  )
  const adjs = adjPage?.content || []
  const totalPages = adjPage?.totalPages || 1

  const { data: allProducts = [] } = useQuery(['products'], productService.getAll)

  // Tìm variant theo mã/tên
  const handleSearchVariant = (q) => {
    setSearchV(q)
    if (!q.trim()) { setSearchResults([]); return }
    const lq = q.toLowerCase()
    const results = []
    allProducts.forEach(p => {
      if (!p.active) return
      ;(p.variants || []).forEach(v => {
        if (
          v.variantCode?.toLowerCase().includes(lq) ||
          v.variantName?.toLowerCase().includes(lq) ||
          p.name?.toLowerCase().includes(lq) ||
          p.code?.toLowerCase().includes(lq)
        ) {
          results.push({ ...v, productCode: p.code, productName: p.name })
        }
      })
    })
    setSearchResults(results.slice(0, 10))
  }

  const addVariant = (v) => {
    if (adjItems.find(i => i.variantId === v.id)) {
      toast.error('Variant này đã có trong danh sách'); return
    }
    setAdjItems(prev => [...prev, {
      variantId: v.id,
      variantCode: v.variantCode,
      variantName: v.variantName,
      productCode: v.productCode,
      productName: v.productName,
      sellUnit: v.sellUnit,
      systemQty: v.stockQty ?? 0,
      actualQty: v.stockQty ?? 0,
      note: ''
    }])
    setSearchV('')
    setSearchResults([])
  }

  const setItemActual = (idx, val) => {
    setAdjItems(prev => prev.map((it, i) => i === idx ? { ...it, actualQty: Number(val) } : it))
  }
  const setItemNote = (idx, val) => {
    setAdjItems(prev => prev.map((it, i) => i === idx ? { ...it, note: val } : it))
  }
  const removeItem = (idx) => setAdjItems(prev => prev.filter((_, i) => i !== idx))

  const handleCreate = async (e) => {
    e.preventDefault()
    if (adjItems.length === 0) { toast.error('Cần ít nhất 1 sản phẩm'); return }
    setCreating(true)
    try {
      await stockAdjustmentService.create({
        reason,
        note,
        items: adjItems.map(it => ({
          variantId: it.variantId,
          actualQty: it.actualQty,
          note: it.note || undefined
        }))
      })
      toast.success('Đã tạo phiếu điều chỉnh DRAFT')
      qc.invalidateQueries(['stock-adjustments'])
      setShowCreate(false)
      setAdjItems([])
      setNote('')
      setReason('STOCKTAKE')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi tạo phiếu')
    } finally {
      setCreating(false)
    }
  }

  const handleConfirm = async (adj) => {
    if (!confirm(`Xác nhận phiếu "${adj.adjNo}"? Tồn kho sẽ thay đổi ngay lập tức.`)) return
    try {
      await stockAdjustmentService.confirm(adj.id)
      toast.success('Đã xác nhận — tồn kho đã cập nhật')
      qc.invalidateQueries(['stock-adjustments'])
      if (detail?.id === adj.id) setDetail(null)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi xác nhận')
    }
  }

  const handleDelete = async (adj) => {
    if (!confirm(`Xóa phiếu DRAFT "${adj.adjNo}"?`)) return
    try {
      await stockAdjustmentService.delete(adj.id)
      toast.success('Đã xóa phiếu')
      qc.invalidateQueries(['stock-adjustments'])
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi xóa')
    }
  }

  const openDetail = async (adj) => {
    try {
      const data = await stockAdjustmentService.getById(adj.id)
      setDetail(data)
    } catch { toast.error('Lỗi tải chi tiết') }
  }

  const statusBadge = (s) => {
    if (s === 'DRAFT') return <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-semibold">⏳ DRAFT</span>
    return <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-semibold">✅ Đã xác nhận</span>
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="⚖️ Điều chỉnh tồn kho"
        actions={
          <button onClick={() => setShowCreate(true)}
            className="bg-orange-500 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600">
            + Tạo phiếu kiểm kê
          </button>
        }
      />

      <AdminCard>
        <AdminTable
          loading={isLoading}
          rows={adjs}
          emptyText="Chưa có phiếu điều chỉnh nào"
          columns={[
            { key: 'adjNo', label: 'Số phiếu', tdClassName: 'font-mono',
              render: adj => <button onClick={() => openDetail(adj)} className="text-orange-600 hover:underline font-semibold text-xs">{adj.adjNo}</button> },
            { key: 'adjDate', label: 'Ngày', tdClassName: 'text-gray-600 text-xs',
              render: adj => dayjs(adj.adjDate).format('DD/MM/YYYY HH:mm') },
            { key: 'reason', label: 'Lý do', render: adj => REASON_LABEL[adj.reason] || adj.reason },
            { key: 'note', label: 'Ghi chú', tdClassName: 'text-gray-500 max-w-[180px] truncate', render: adj => adj.note || '—' },
            { key: 'status', label: 'Trạng thái', thClassName: 'text-center', tdClassName: 'text-center',
              render: adj => statusBadge(adj.status) },
            { key: 'actions', label: 'Thao tác', isAction: true, thClassName: 'text-center', tdClassName: 'text-center',
              render: adj => (
                <div className="flex items-center justify-center gap-1.5">
                  {adj.status === 'DRAFT' && <>
                    <button onClick={() => handleConfirm(adj)} className="text-green-600 hover:underline text-xs font-medium px-1.5 py-1 rounded hover:bg-green-50">✅ XN</button>
                    <button onClick={() => handleDelete(adj)} className="text-red-500 hover:underline text-xs font-medium px-1.5 py-1 rounded hover:bg-red-50">🗑️</button>
                  </>}
                  <button onClick={() => openDetail(adj)} className="text-blue-500 hover:underline text-xs px-1.5 py-1 rounded hover:bg-blue-50">👁️</button>
                </div>
              )},
          ]}
          mobileCard={adj => (
            <div>
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <button onClick={() => openDetail(adj)} className="font-mono font-bold text-orange-600 text-sm hover:underline">{adj.adjNo}</button>
                  <p className="text-xs text-gray-500 mt-0.5">{dayjs(adj.adjDate).format('DD/MM/YYYY HH:mm')}</p>
                </div>
                {statusBadge(adj.status)}
              </div>
              <p className="text-sm text-gray-700 mb-0.5">{REASON_LABEL[adj.reason] || adj.reason}</p>
              {adj.note && <p className="text-xs text-gray-400 mb-2">{adj.note}</p>}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button onClick={() => openDetail(adj)}
                  className="flex-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 py-1.5 rounded-lg font-medium text-center">👁️ Xem</button>
                {adj.status === 'DRAFT' && <>
                  <button onClick={() => handleConfirm(adj)}
                    className="flex-1 text-xs bg-green-50 text-green-600 hover:bg-green-100 py-1.5 rounded-lg font-medium text-center">✅ Xác nhận</button>
                  <button onClick={() => handleDelete(adj)}
                    className="flex-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 py-1.5 rounded-lg font-medium text-center">🗑️ Xóa</button>
                </>}
              </div>
            </div>
          )}
        />
        <div className="flex justify-center items-center gap-3 pt-3 border-t text-sm">
          <button disabled={page===0} onClick={() => setPage(p => p-1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100">← Trước</button>
          <span className="text-gray-500">Trang {page+1}/{totalPages}</span>
          <button disabled={page>=totalPages-1} onClick={() => setPage(p => p+1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100">Sau →</button>
        </div>
      </AdminCard>

      {/* Modal tạo phiếu */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">⚖️ Tạo phiếu điều chỉnh tồn kho</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Lý do + Ghi chú */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Lý do điều chỉnh *</label>
                  <select value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                    {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú phiếu</label>
                  <input value={note} onChange={e => setNote(e.target.value)}
                    placeholder="VD: Kiểm kê tháng 4/2026"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
              </div>

              {/* Search variant */}
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-600 mb-1">🔍 Tìm sản phẩm/variant</label>
                <input value={searchV} onChange={e => handleSearchVariant(e.target.value)}
                  placeholder="Nhập mã, tên sản phẩm hoặc mã variant..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                {searchResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {searchResults.map(v => (
                      <button key={v.id} type="button" onClick={() => addVariant(v)}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm border-b last:border-0">
                        <span className="font-mono font-semibold text-orange-700">{v.variantCode}</span>
                        {' — '}{v.variantName}
                        <span className="text-gray-400 ml-1 text-xs">({v.productCode} | tồn: {v.stockQty ?? 0} {v.sellUnit})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bảng dòng điều chỉnh */}
              {adjItems.length > 0 && (
                <div className="overflow-auto border rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-orange-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Variant</th>
                        <th className="px-3 py-2 text-left">SP</th>
                        <th className="px-3 py-2 text-right">Tồn HT</th>
                        <th className="px-3 py-2 text-right w-28">Thực tế *</th>
                        <th className="px-3 py-2 text-right">Chênh lệch</th>
                        <th className="px-3 py-2 text-left">Ghi chú dòng</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjItems.map((it, idx) => {
                        const diff = it.actualQty - it.systemQty
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-1.5 font-mono font-semibold text-orange-700">{it.variantCode}</td>
                            <td className="px-3 py-1.5 text-gray-700">{it.productName}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">{it.systemQty} {it.sellUnit}</td>
                            <td className="px-3 py-1.5">
                              <input type="text" inputMode="numeric" value={it.actualQty}
                                onChange={e => { const r=e.target.value.replace(/\D/g,''); setItemActual(idx, r) }}
                                onBlur={() => { const n=parseInt(it.actualQty); setItemActual(idx, isNaN(n)||n<0?0:n) }}
                                className="w-full border rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-orange-400" />
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold">
                              <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}>
                                {diff > 0 ? '+' : ''}{diff} {it.sellUnit}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <input value={it.note} onChange={e => setItemNote(idx, e.target.value)}
                                placeholder="Lý do..."
                                className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
                            </td>
                            <td className="px-3 py-1.5">
                              <button type="button" onClick={() => removeItem(idx)}
                                className="text-red-400 hover:text-red-600 text-base">&times;</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                <button type="submit" disabled={creating || adjItems.length === 0}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-60">
                  {creating ? 'Đang tạo...' : `Tạo phiếu DRAFT (${adjItems.length} dòng)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal chi tiết phiếu */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Chi tiết phiếu {detail.adjNo}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {REASON_LABEL[detail.reason]} · {dayjs(detail.adjDate).format('DD/MM/YYYY HH:mm')}
                  · {statusBadge(detail.status)}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 text-2xl">&times;</button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Variant</th>
                    <th className="px-3 py-2 text-right">Tồn HT</th>
                    <th className="px-3 py-2 text-right">Thực tế</th>
                    <th className="px-3 py-2 text-right">Chênh lệch</th>
                    <th className="px-3 py-2 text-left">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items || []).map((it, i) => {
                    const diff = it.diffQty ?? (it.actualQty - it.systemQty)
                    return (
                      <tr key={it.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-3 py-1.5">
                          <div className="font-mono font-semibold text-orange-700 text-xs">{it.variantCode}</div>
                          <div className="text-gray-500 text-xs">{it.productName}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right">{it.systemQty} {it.sellUnit}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{it.actualQty} {it.sellUnit}</td>
                        <td className="px-3 py-1.5 text-right font-bold">
                          <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 text-xs">{it.note || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex justify-between items-center">
              <div className="text-xs text-gray-500">
                Tạo bởi: {detail.createdBy || 'N/A'}
                {detail.confirmedBy && ` · Xác nhận: ${detail.confirmedBy}`}
              </div>
              <div className="flex gap-2">
                {detail.status === 'DRAFT' && (
                  <button onClick={() => handleConfirm(detail)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
                    ✅ Xác nhận điều chỉnh
                  </button>
                )}
                <button onClick={() => setDetail(null)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
