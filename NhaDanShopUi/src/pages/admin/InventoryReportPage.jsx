import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportService, downloadBlob } from '../../services/reportService'
import { useSort } from '../../hooks/useSort'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

export default function InventoryReportPage() {
  const today = dayjs().format('YYYY-MM-DD')
  const firstDay = dayjs().startOf('month').format('YYYY-MM-DD')
  const [from, setFrom] = useState(firstDay)
  const [to, setTo] = useState(today)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

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
    { enabled: !!(from && to) }
  )

  const rows = (data?.rows || []).filter(r =>
    r.productName.toLowerCase().includes(search.toLowerCase()) ||
    r.productCode.toLowerCase().includes(search.toLowerCase())
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
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Đến ngày *</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <button onClick={() => refetch()}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
            🔍 Xem báo cáo
          </button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm theo tên, mã sản phẩm..."
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full max-w-sm"
        />

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Đang tải dữ liệu...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-sm text-blue-600 font-medium">Tổng sản phẩm</div>
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
                  {rows.filter(r => r.closingStock <= 5).length}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b">
                    <SortHeader field="productCode" className="text-left px-3 py-3">Mã SP</SortHeader>
                    <SortHeader field="productName" className="text-left px-3 py-3">Tên sản phẩm</SortHeader>
                    <SortHeader field="categoryName" className="text-left px-3 py-3">Danh mục</SortHeader>
                    <SortHeader field="openingStock" className="text-right px-3 py-3">Tồn đầu kỳ</SortHeader>
                    <SortHeader field="totalReceived" className="text-right px-3 py-3">Nhập kỳ</SortHeader>
                    <SortHeader field="totalSold" className="text-right px-3 py-3">Xuất kỳ</SortHeader>
                    <SortHeader field="closingStock" className="text-right px-3 py-3">Tồn cuối kỳ</SortHeader>
                    <SortHeader field="closingStockValue" className="text-right px-3 py-3">Giá trị tồn</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                  ) : sortedRows.map(r => (
                    <tr key={r.productId} className={`border-b hover:bg-gray-50 transition ${r.closingStock <= 0 ? 'bg-red-50' : r.closingStock <= 5 ? 'bg-orange-50' : ''}`}>
                      <td className="px-3 py-3 font-mono text-xs text-gray-500">{r.productCode}</td>
                      <td className="px-3 py-3 font-medium text-gray-800">{r.productName}</td>
                      <td className="px-3 py-3 text-gray-500">{r.categoryName}</td>
                      <td className="px-3 py-3 text-right">{r.openingStock} {r.sellUnit}</td>
                      <td className="px-3 py-3 text-right text-green-600">+{r.totalReceived}</td>
                      <td className="px-3 py-3 text-right text-red-600">-{r.totalSold}</td>
                      <td className="px-3 py-3 text-right font-bold">
                        <span className={r.closingStock <= 0 ? 'text-red-700' : r.closingStock <= 5 ? 'text-orange-600' : 'text-gray-800'}>
                          {r.closingStock}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-blue-700">
                        {Number(r.closingStockValue).toLocaleString('vi-VN')} ₫
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-right">Tổng giá trị tồn kho:</td>
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
