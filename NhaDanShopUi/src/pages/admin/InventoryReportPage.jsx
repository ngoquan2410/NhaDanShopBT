﻿import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportService, downloadBlob } from '../../services/reportService'
import { useSort } from '../../hooks/useSort'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

export default function InventoryReportPage() {
  // today = ngày hôm nay thực tế, không cho phép chọn toDate > today
  const today = dayjs().format('YYYY-MM-DD')
  const firstDay = dayjs().startOf('month').format('YYYY-MM-DD')
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const [dateError, setDateError] = useState('')

  const handleFromChange = (val) => {
    setFrom(val)
    setDateError('')
    // Nếu from > to thì tự động đẩy to = from
    if (val > to) {
      setTo(val)
    }
  }

  const handleToChange = (val) => {
    setDateError('')
    if (val > today) {
      setDateError('Đến ngày không được vượt quá ngày hôm nay.')
      setTo(today)
      return
    }
    if (val < from) {
      setDateError('Đến ngày không được nhỏ hơn Từ ngày.')
      return
    }
    setTo(val)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await reportService.exportInventoryExcel(from, to)
      downloadBlob(blob, `TonKho_${from}_${to}.xlsx`)
      toast.success('Đã xuất file Excel!')
    } catch { toast.error('Lỗi khi xuất Excel') }
    finally { setExporting(false) }
  }

  const { data, isLoading, refetch } = useQuery(
    ['inventory-report', from, to],
    () => reportService.getInventoryReport(from, to),
    { enabled: !!(from && to) && !dateError }
  )

  const rows = (data?.rows || []).filter(r =>
    r.productName?.toLowerCase().includes(search.toLowerCase()) ||
    r.productCode?.toLowerCase().includes(search.toLowerCase()) ||
    r.variantCode?.toLowerCase().includes(search.toLowerCase())
  )
  const { sorted: sortedRows, SortHeader } = useSort(rows, 'productName')
  const totalClosingValue = rows.reduce((s, r) => s + Number(r.closingStockValue || 0), 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col xs:flex-row xs:items-center gap-3 justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Báo Cáo Tồn Kho</h2>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
          {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-3 sm:p-4 space-y-3">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Từ ngày *</label>
            <input type="date" value={from} max={today} onChange={e => handleFromChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Đến ngày *</label>
            <input type="date" value={to} min={from} max={today} onChange={e => handleToChange(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${dateError ? 'border-red-400 focus:ring-red-400' : 'focus:ring-green-500'}`} />
          </div>
          <button onClick={() => { if (dateError) { toast.error(dateError); return } refetch() }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
            🔍 Xem báo cáo
          </button>
        </div>
        {dateError && <span className="text-red-500 text-xs">⚠️ {dateError}</span>}

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm theo tên, mã SP hoặc mã biến thể..."
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full" />

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Đang tải dữ liệu...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-xs text-blue-600 font-medium">Tổng biến thể</div>
                <div className="text-2xl font-bold text-blue-800">{rows.length}</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="text-xs text-green-600 font-medium">Giá trị tồn kho</div>
                <div className="text-base sm:text-xl font-bold text-green-800">{totalClosingValue.toLocaleString('vi-VN')} ₫</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                <div className="text-xs text-orange-600 font-medium">Kỳ báo cáo</div>
                <div className="text-xs font-bold text-orange-800">{dayjs(from).format('DD/MM/YYYY')} – {dayjs(to).format('DD/MM/YYYY')}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="text-xs text-red-600 font-medium">Hàng sắp hết</div>
                <div className="text-2xl font-bold text-red-800">{rows.filter(r => r.closingStock <= (r.minStockQty ?? 5)).length}</div>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b">
                    <SortHeader field="productCode" className="text-left px-3 py-3 w-24">Mã SP</SortHeader>
                    <SortHeader field="variantCode" className="text-left px-3 py-3 w-32">Mã biến thể</SortHeader>
                    <SortHeader field="variantName" className="text-left px-3 py-3">Tên</SortHeader>
                    <SortHeader field="categoryName" className="text-left px-3 py-3 w-24">Danh mục</SortHeader>
                    <SortHeader field="openingStock" className="text-right px-3 py-3 w-20">Đầu kỳ</SortHeader>
                    <SortHeader field="totalReceived" className="text-right px-3 py-3 w-16">Nhập</SortHeader>
                    <SortHeader field="totalSold" className="text-right px-3 py-3 w-16">Xuất</SortHeader>
                    <SortHeader field="closingStock" className="text-right px-3 py-3 w-20">Cuối kỳ</SortHeader>
                    <SortHeader field="closingStockValue" className="text-right px-3 py-3 w-32">Giá trị tồn</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                  ) : sortedRows.map(r => (
                    <tr key={r.variantId ?? r.productId}
                      className={`border-b hover:bg-gray-50 transition ${r.closingStock <= 0 ? 'bg-red-50' : r.closingStock <= (r.minStockQty ?? 5) ? 'bg-orange-50' : ''}`}>
                      <td className="px-3 py-2 font-mono text-xs text-gray-400">{r.productCode}</td>
                      <td className="px-3 py-2 font-mono text-xs text-purple-700 font-bold">{r.variantCode || r.productCode}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 text-sm">{r.variantName || r.productName}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{r.categoryName}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.openingStock} {r.sellUnit}</td>
                      <td className="px-3 py-2 text-right text-green-600 text-xs font-medium">+{r.totalReceived}</td>
                      <td className="px-3 py-2 text-right text-red-600 text-xs font-medium">-{r.totalSold}</td>
                      <td className="px-3 py-2 text-right font-bold text-xs">
                        <span className={r.closingStock <= 0 ? 'text-red-700' : r.closingStock <= (r.minStockQty ?? 5) ? 'text-orange-600' : 'text-gray-800'}>
                          {r.closingStock} {r.sellUnit}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-blue-700 text-xs">{Number(r.closingStockValue).toLocaleString('vi-VN')} ₫</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-right text-sm">Tổng giá trị tồn kho:</td>
                    <td className="px-3 py-3 text-right text-blue-700">{totalClosingValue.toLocaleString('vi-VN')} ₫</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {sortedRows.length === 0 ? (
                <div className="text-center py-8 text-gray-400">Không có dữ liệu</div>
              ) : sortedRows.map(r => (
                <div key={r.variantId ?? r.productId}
                  className={`rounded-xl p-3 border ${r.closingStock <= 0 ? 'bg-red-50 border-red-200' : r.closingStock <= (r.minStockQty ?? 5) ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <span className="font-medium text-sm text-gray-800">{r.variantName || r.productName}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-xs text-purple-700">{r.variantCode}</span>
                        <span className="text-xs text-gray-400">· {r.categoryName}</span>
                      </div>
                    </div>
                    <span className={`font-bold text-sm ${r.closingStock <= 0 ? 'text-red-700' : r.closingStock <= (r.minStockQty ?? 5) ? 'text-orange-600' : 'text-gray-800'}`}>
                      {r.closingStock} {r.sellUnit}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <div className="text-center"><p className="text-gray-400">Đầu kỳ</p><p className="font-medium">{r.openingStock}</p></div>
                    <div className="text-center"><p className="text-gray-400">Nhập</p><p className="font-medium text-green-600">+{r.totalReceived}</p></div>
                    <div className="text-center"><p className="text-gray-400">Xuất</p><p className="font-medium text-red-600">-{r.totalSold}</p></div>
                    <div className="text-center"><p className="text-gray-400">GT tồn</p><p className="font-medium text-blue-600">{(Number(r.closingStockValue)/1000).toFixed(0)}K</p></div>
                  </div>
                </div>
              ))}
              <div className="bg-gray-50 rounded-xl p-3 text-right text-sm font-semibold border border-gray-200">
                Tổng giá trị tồn: <span className="text-blue-700">{totalClosingValue.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

