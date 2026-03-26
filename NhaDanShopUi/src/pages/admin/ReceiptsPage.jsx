﻿import { useState, useRef } from 'react'
import { useReceipts, useReceiptMutations } from '../../hooks/useReceipts'
import { useProducts } from '../../hooks/useProducts'
import { useSort } from '../../hooks/useSort'
import { receiptService } from '../../services/receiptService'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import BarcodeLabelPrinter from '../../components/BarcodeLabelPrinter'

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
          <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
          <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Tên nhà cung cấp" />
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

// ── Import Excel Phiếu Nhập ───────────────────────────────────────────────────
function ImportReceiptExcelForm({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [supplierName, setSupplierName] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { toast.error('Chỉ hỗ trợ file .xlsx'); return }
    setFile(f); setResult(null)
  }

  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      await receiptService.downloadTemplate()
      toast.success('Đã tải template! Xem sheet "Hướng dẫn" trong file.')
    } catch {
      toast.error('Lỗi tải template')
    } finally {
      setDownloading(false)
    }
  }

  const handleImport = async () => {
    if (!file) { toast.error('Chưa chọn file Excel'); return }
    if (!supplierName.trim()) { toast.error('Vui lòng nhập tên nhà cung cấp'); return }
    setLoading(true)
    try {
      const res = await receiptService.importExcel(file, supplierName.trim(), note.trim())
      setResult(res)
      if (res.successItems > 0) {
        toast.success(`Tạo phiếu nhập ${res.receiptNo} thành công! (${res.successItems} SP)`)
        onSuccess()
      } else {
        toast.error('Không có dòng nào thành công — phiếu không được tạo')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Lỗi import Excel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Banner download template */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-4 flex items-center justify-between">
        <div className="text-white">
          <p className="font-bold text-base">📥 Bước 1: Tải file template</p>
          <p className="text-green-100 text-xs mt-0.5">Có dummy data mẫu (SP có sẵn + SP mới tạo) + sheet hướng dẫn</p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          disabled={downloading}
          className="bg-white text-green-700 font-bold px-5 py-2.5 rounded-lg hover:bg-green-50 transition flex items-center gap-2 text-sm whitespace-nowrap disabled:opacity-70"
        >
          {downloading
            ? <><span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>Đang tải...</>
            : <>⬇️ Tải Template Excel</>}
        </button>
      </div>

      {/* Cấu trúc nhanh */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
        <p className="font-semibold mb-2">📋 Bước 2: Điền dữ liệu (từ dòng 4):</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-green-100">
                {['A: Mã SP','B: Tên SP','C: SL *','D: Giá nhập *','E: Ghi chú','F: Danh mục (tạo mới)','G: Đơn vị (tạo mới)'].map(h => (
                  <th key={h} className="border border-green-200 px-2 py-1 text-left whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                {['BT001','Bánh Tráng Rong Biển','5','65000','SP có sẵn','',''].map((v,i) => (
                  <td key={i} className="border border-green-200 px-2 py-1 text-gray-700">{v}</td>
                ))}
              </tr>
              <tr className="bg-yellow-50">
                {['','Sản Phẩm Mới XYZ','10','25000','SP mới tạo','Danh Mục Mới','gói'].map((v,i) => (
                  <td key={i} className="border border-green-200 px-2 py-1 text-amber-700 font-medium">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded p-2">
            <p className="font-semibold text-green-700">✅ SP đã có trong hệ thống:</p>
            <p>Tìm theo Mã (cột A) → Tên (cột B)</p>
          </div>
          <div className="bg-yellow-50 rounded p-2 border border-yellow-200">
            <p className="font-semibold text-amber-700">✨ SP chưa có (tự tạo mới):</p>
            <p>Để trống cột A + điền cột F, G</p>
          </div>
        </div>
      </div>

      {/* Thông tin phiếu */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">📝 Bước 3: Nhập thông tin phiếu</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp *</label>
            <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
              placeholder="VD: Nhà Cung Cấp ABC"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú phiếu</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="VD: Nhập hàng tháng 3"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
      </div>

      {/* Upload */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">📤 Bước 4: Upload file Excel</p>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragging ? 'border-green-500 bg-green-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-green-50'}`}
        >
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => handleFile(e.target.files?.[0])} />
          {file ? (
            <div className="space-y-1">
              <div className="text-3xl">📄</div>
              <p className="font-medium text-green-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
              <button type="button" onClick={e => { e.stopPropagation(); setFile(null); setResult(null) }}
                className="text-xs text-red-500 hover:text-red-700 underline">Chọn file kh��c</button>
            </div>
          ) : (
            <div className="space-y-2 text-gray-500">
              <div className="text-4xl">📊</div>
              <p className="font-medium text-gray-700">Kéo thả file .xlsx vào đây hoặc click để chọn</p>
              <p className="text-xs text-gray-400">SP chưa có sẽ được tạo tự động từ file</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Hủy</button>
        <button onClick={handleImport} disabled={!file || !supplierName.trim() || loading}
          className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 flex items-center gap-2">
          {loading
            ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang xử lý...</>
            : '📥 Tạo phiếu nhập từ Excel'}
        </button>
      </div>

      {/* Kết quả */}
      {result && (
        <div className={`rounded-xl border p-5 space-y-4 ${result.successItems > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-800">📊 Kết quả Import</h4>
            {result.receiptNo && (
              <span className="font-mono text-sm bg-green-200 text-green-800 px-3 py-1 rounded-full font-bold">
                Phiếu: {result.receiptNo}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: 'Tổng dòng', value: result.totalRows, color: 'blue' },
              { label: '✅ Thành công', value: result.successItems, color: 'green' },
              { label: '✨ SP mới tạo', value: result.newProducts || 0, color: 'purple' },
              { label: '⏭️ Bỏ qua', value: result.skippedItems, color: 'yellow' },
              { label: '❌ Lỗi', value: result.errorItems, color: 'red' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`bg-${color}-100 rounded-lg p-3 text-center`}>
                <div className={`text-xl font-bold text-${color}-700`}>{value}</div>
                <div className={`text-xs text-${color}-600 mt-1`}>{label}</div>
              </div>
            ))}
          </div>
          {result.warnings?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-yellow-700 mb-2">⚠️ SP mới tạo / Cảnh báo:</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {result.warnings.map((w, i) => <li key={i} className="text-xs text-yellow-700">• {w}</li>)}
              </ul>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-red-700 mb-2">❌ Lỗi:</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
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
  const [printReceipt, setPrintReceipt] = useState(null) // receipt vừa tạo → in nhãn
  const queryClient = useQueryClient()

  const { data, isLoading } = useReceipts(page, from || undefined, to || undefined)
  const { data: products = [] } = useProducts()
  const { create, remove } = useReceiptMutations()

  const receipts = data?.content || []
  const totalPages = data?.totalPages || 1
  const { sorted: sortedReceipts, SortHeader } = useSort(receipts, 'receiptDate', 'desc')

  const handleCreate = async (formData) => {
    const newReceipt = await create.mutateAsync(formData)
    setShowModal(false)
    // Prompt in nhãn ngay sau khi tạo phiếu nhập
    setPrintReceipt(newReceipt)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Phiếu Nhập Kho</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
            📊 Import Excel
          </button>
          <button onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
            + Tạo phiếu nhập
          </button>
        </div>
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
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setPrintReceipt({ ...r, showPrinter: true })}
                        className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                        title="In nhãn mã vạch"
                      >🏷️ In nhãn</button>
                      <button onClick={() => { if (window.confirm('Xóa phiếu nhập này?')) remove.mutate(r.id) }}
                        className="text-red-600 hover:text-red-800 text-xs">🗑️ Xóa</button>
                    </div>
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
