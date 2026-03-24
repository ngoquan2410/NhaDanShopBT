import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportService, downloadBlob } from '../../services/reportService'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

function fmt(num) { return Number(num || 0).toLocaleString('vi-VN') }

function SummaryCard({ label, value, sub, color }) {
  const colors = { green: 'bg-green-50 border-green-200', blue: 'bg-blue-50 border-blue-200', orange: 'bg-orange-50 border-orange-200' }
  return (
    <div className={`border rounded-xl p-5 ${colors[color] || colors.blue}`}>
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

const TABS = ['Tuần này', 'Tháng này', 'Theo tuần', 'Theo tháng', 'Tùy chỉnh']

export default function ProfitReportPage() {
  const [tab, setTab] = useState(0)
  const [from, setFrom] = useState(dayjs().startOf('year').format('YYYY-MM-DD'))
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'))
  const [exporting, setExporting] = useState(false)

  const { data: weekData } = useQuery(['profit-week'], reportService.getProfitThisWeek)
  const { data: monthData } = useQuery(['profit-month'], reportService.getProfitThisMonth)
  const { data: weeklyData } = useQuery(['profit-weekly', from, to],
    () => reportService.getProfitWeekly(from, to), { enabled: tab === 2 })
  const { data: monthlyData } = useQuery(['profit-monthly', from, to],
    () => reportService.getProfitMonthly(from, to), { enabled: tab === 3 })
  const { data: customData } = useQuery(['profit-custom', from, to],
    () => reportService.getProfitByRange(from, to), { enabled: tab === 4 })

  const currentData = tab === 0 ? weekData : tab === 1 ? monthData : tab === 4 ? customData : null

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await reportService.exportProfitExcel(from, to)
      downloadBlob(blob, `LoiNhuan_${from}_${to}.xlsx`)
      toast.success('Đã xuất file Excel!')
    } catch { toast.error('Lỗi khi xuất Excel') }
    finally { setExporting(false) }
  }
  const chartData = (tab === 2 ? weeklyData : tab === 3 ? monthlyData : null) || []
  const formattedChart = chartData.map(d => ({
    label: tab === 2
      ? `${dayjs(d.fromDate).format('DD/MM')} – ${dayjs(d.toDate).format('DD/MM')}`
      : dayjs(d.fromDate).format('MM/YYYY'),
    'Doanh thu': Number(d.totalRevenue),
    'Giá vốn': Number(d.totalCost),
    'Lợi nhuận': Number(d.totalProfit),
  }))

  const showDateFilter = tab === 2 || tab === 3 || tab === 4

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Báo Cáo Lợi Nhuận</h2>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
          {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === i
                ? 'bg-green-600 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Date range filter */}
      {showDateFilter && (
        <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
      )}

      {/* Summary cards for single-period tabs */}
      {currentData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Doanh thu" value={`${fmt(currentData.totalRevenue)} ₫`} color="blue" />
          <SummaryCard label="Giá vốn" value={`${fmt(currentData.totalCost)} ₫`} color="orange" />
          <SummaryCard label="Lợi nhuận" value={`${fmt(currentData.totalProfit)} ₫`} color="green" />
          <SummaryCard
            label="Tỉ lệ lãi"
            value={`${currentData.profitMarginPct || 0}%`}
            sub={`${currentData.totalInvoices || 0} hóa đơn`}
            color="green"
          />
        </div>
      )}

      {/* Chart for weekly/monthly */}
      {(tab === 2 || tab === 3) && formattedChart.length > 0 && (
        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-gray-700 mb-4">
            {tab === 2 ? 'Biểu đồ lợi nhuận theo tuần' : 'Biểu đồ lợi nhuận theo tháng'}
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={formattedChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `${Number(v).toLocaleString('vi-VN')} ₫`} />
              <Legend />
              <Bar dataKey="Doanh thu" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Giá vốn" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Lợi nhuận" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Table */}
          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b">
                  <th className="text-left px-3 py-2">Kỳ</th>
                  <th className="text-right px-3 py-2">Doanh thu</th>
                  <th className="text-right px-3 py-2">Giá vốn</th>
                  <th className="text-right px-3 py-2">Lợi nhuận</th>
                  <th className="text-right px-3 py-2">Tỉ lệ lãi</th>
                  <th className="text-right px-3 py-2">Số HĐ</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((d, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{formattedChart[i]?.label}</td>
                    <td className="px-3 py-2 text-right">{fmt(d.totalRevenue)} ₫</td>
                    <td className="px-3 py-2 text-right text-orange-600">{fmt(d.totalCost)} ₫</td>
                    <td className="px-3 py-2 text-right text-green-700 font-semibold">{fmt(d.totalProfit)} ₫</td>
                    <td className="px-3 py-2 text-right">{d.profitMarginPct || 0}%</td>
                    <td className="px-3 py-2 text-right">{d.totalInvoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(tab === 2 || tab === 3) && formattedChart.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
          Chưa có dữ liệu cho khoảng thời gian này
        </div>
      )}
    </div>
  )
}
