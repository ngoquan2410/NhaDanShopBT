import { useState } from 'react'
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Báo Cáo Tồn Kho</h2>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
          {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Từ ngày *</label>
            <input
              type="date"
              value={from}
              max={today}
              onChange={e => handleFromChange(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Đến ngày *</label>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={e => handleToChange(e.target.value)}
              className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${dateError ? 'border-red-400 focus:ring-red-400' : 'focus:ring-green-500'}`}
            />
          </div>
          <button
            onClick={() => {
              if (dateError) { toast.error(dateError); return }
              refetch()
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
            🔍 Xem báo cáo
          </button>
          {dateError && (
            <span className="text-red-500 text-xs self-center">⚠️ {dateError}</span>
          )}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm theo tên, mã SP hoặc mã biến thể..."
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full max-w-sm"
        />

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Đang tải dữ liệu...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-sm text-blue-600 font-medium">Tổng biến thể</div>
                <div className="text-2xl font-bold text-blue-800">{rows.length}</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="text-sm text-green-600 font-medium">Giá trị tồn kho</div>
                <div className="text-xl font-bold text-green-800">{totalClosingValue.toLocaleString('vi-VN')} ₫</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="text-sm text-orange-600 font-medium">Kỳ báo cáo</div>
                <div className="text-sm font-bold text-orange-800">
                  {dayjs(from).format('DD/MM/YYYY')} – {dayjs(to).format('DD/MM/YYYY')}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-sm text-red-600 font-medium">Hàng sắp hết</div>
                <div className="text-2xl font-bold text-red-800">
                  {rows.filter(r => r.closingStock <= (r.minStockQty ?? 5)).length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '1000px' }}>
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b">
                    <SortHeader field="productCode" className="text-left px-3 py-3 w-24">Mã SP</SortHeader>
                    <SortHeader field="variantCode" className="text-left px-3 py-3 w-32">Mã biến thể</SortHeader>
                    <SortHeader field="variantName" className="text-left px-3 py-3">Tên biến thể</SortHeader>
                    <SortHeader field="categoryName" className="text-left px-3 py-3 w-28">Danh mục</SortHeader>
                    <SortHeader field="openingStock" className="text-right px-3 py-3 w-28">Tồn đầu kỳ</SortHeader>
                    <SortHeader field="totalReceived" className="text-right px-3 py-3 w-24">Nhập kỳ</SortHeader>
                    <SortHeader field="totalSold" className="text-right px-3 py-3 w-24">Xuất kỳ</SortHeader>
                    <SortHeader field="closingStock" className="text-right px-3 py-3 w-28">Tồn cuối kỳ</SortHeader>
                    <SortHeader field="closingStockValue" className="text-right px-3 py-3 w-36">Giá trị tồn</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                  ) : sortedRows.map(r => (
                    <tr key={r.variantId ?? r.productId}
                      className={`border-b hover:bg-gray-50 transition ${r.closingStock <= 0 ? 'bg-red-50' : r.closingStock <= (r.minStockQty ?? 5) ? 'bg-orange-50' : ''}`}>
                      <td className="px-3 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{r.productCode}</td>
                      <td className="px-3 py-3 font-mono text-xs text-purple-700 font-bold whitespace-nowrap">
                        {r.variantCode || r.productCode}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-800">
                        {r.variantName || r.productName}
                        {r.variantCode !== r.productCode && (
                          <span className="ml-2 text-xs text-gray-400 font-normal">({r.productName})</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{r.categoryName}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{r.openingStock} {r.sellUnit}</td>
                      <td className="px-3 py-3 text-right text-green-600 whitespace-nowrap font-medium">+{r.totalReceived}</td>
                      <td className="px-3 py-3 text-right text-red-600 whitespace-nowrap font-medium">-{r.totalSold}</td>
                      <td className="px-3 py-3 text-right font-bold whitespace-nowrap">
                        <span className={r.closingStock <= 0 ? 'text-red-700' : r.closingStock <= (r.minStockQty ?? 5) ? 'text-orange-600' : 'text-gray-800'}>
                          {r.closingStock} {r.sellUnit}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-blue-700 whitespace-nowrap">
                        {Number(r.closingStockValue).toLocaleString('vi-VN')} ₫
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan={8} className="px-3 py-3 text-right">Tổng giá trị tồn kho:</td>
                    <td className="px-3 py-3 text-right text-blue-700">
                      {totalClosingValue.toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
