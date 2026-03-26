import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { revenueService, downloadBlob } from '../../services/revenueService'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'

// ── Màu sắc cho biểu đồ ──────────────────────────────────────────────────────
const COLORS = ['#166534','#15803d','#16a34a','#22c55e','#4ade80',
                '#86efac','#bbf7d0','#dcfce7','#f0fdf4','#6366f1',
                '#8b5cf6','#ec4899','#f97316','#eab308','#14b8a6']

const fmt = n => Number(n || 0).toLocaleString('vi-VN')

// ── Period options ────────────────────────────────────────────────────────────
const PERIODS = [
  { value: 'daily',   label: 'Theo ngày' },
  { value: 'weekly',  label: 'Theo tuần' },
  { value: 'monthly', label: 'Theo tháng' },
  { value: 'yearly',  label: 'Theo năm' },
]

// ── Tab options ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'total',    label: '📊 Tổng doanh thu' },
  { id: 'product',  label: '📦 Theo sản phẩm' },
  { id: 'category', label: '🗂️ Theo danh mục' },
]

// ── Tooltip custom cho BarChart ───────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <b>{fmt(p.value)} ₫</b>
        </p>
      ))}
    </div>
  )
}

// ── Default dates ─────────────────────────────────────────────────────────────
const today = dayjs()
const defaultFrom = today.startOf('month').format('YYYY-MM-DD')
const defaultTo   = today.format('YYYY-MM-DD')

// ��═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function RevenuePage() {
  const [tab, setTab]       = useState('total')
  const [period, setPeriod] = useState('daily')
  const [from, setFrom]     = useState(defaultFrom)
  const [to, setTo]         = useState(defaultTo)
  const [exporting, setExporting] = useState(false)

  // ── Queries ────────────────────────────────────────────────────────────────
  const totalQ = useQuery(
    ['revenue-total', from, to, period],
    () => revenueService.getTotal(from, to, period),
    { enabled: !!from && !!to && tab === 'total', keepPreviousData: true }
  )

  const productQ = useQuery(
    ['revenue-product', from, to, period],
    () => revenueService.getByProduct(from, to, period),
    { enabled: !!from && !!to && tab === 'product', keepPreviousData: true }
  )

  const categoryQ = useQuery(
    ['revenue-category', from, to, period],
    () => revenueService.getByCategory(from, to, period),
    { enabled: !!from && !!to && tab === 'category', keepPreviousData: true }
  )

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!from || !to) { toast.error('Vui lòng chọn khoảng thời gian'); return }
    setExporting(true)
    try {
      let blob, filename
      if (tab === 'total') {
        blob = await revenueService.exportTotal(from, to, period)
        filename = `SoDoanhthu_${from}_${to}.xlsx`
      } else if (tab === 'product') {
        blob = await revenueService.exportByProduct(from, to, period)
        filename = `DoanhThu_SanPham_${from}_${to}.xlsx`
      } else {
        blob = await revenueService.exportByCategory(from, to, period)
        filename = `DoanhThu_DanhMuc_${from}_${to}.xlsx`
      }
      downloadBlob(blob, filename)
      toast.success('Xuất Excel thành công!')
    } catch {
      toast.error('Lỗi khi xuất Excel')
    } finally {
      setExporting(false)
    }
  }, [tab, from, to, period])

  // ── Xác định data active ───────────────────────────────────────────────────
  const isLoading = totalQ.isLoading || productQ.isLoading || categoryQ.isLoading

  // Tổng doanh thu
  const totalData   = totalQ.data
  const totalChartData = (totalData?.rows || []).map(r => ({ name: r.label, amount: Number(r.amount) }))

  // Sản phẩm
  const productData = productQ.data || []
  const productChartData = productData.slice(0, 15).map(p => ({
    name: p.productName.length > 20 ? p.productName.slice(0, 20) + '…' : p.productName,
    amount: Number(p.totalAmount),
    qty: Number(p.totalQty),
  }))

  // Danh mục
  const categoryData = categoryQ.data || []
  const categoryChartData = categoryData.map(c => ({
    name: c.categoryName,
    value: Number(c.totalAmount),
  }))

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-800">📈 Quản Lý Doanh Thu</h2>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60 font-medium text-sm"
        >
          {exporting ? '⏳ Đang xuất...' : '📥 Xuất Excel (S1a-HKD)'}
        </button>
      </div>

      {/* ── Bộ lọc ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Từ ngày</label>
          <input
            type="date" value={from}
            onChange={e => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Đến ngày</label>
          <input
            type="date" value={to}
            onChange={e => setTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Chu kỳ</label>
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        {/* Quick select buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Hôm nay',    from: today.format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD'), period: 'daily'   },
            { label: 'Tuần này',   from: today.startOf('week').add(1,'day').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD'), period: 'weekly'  },
            { label: 'Tháng này',  from: today.startOf('month').format('YYYY-MM-DD'), to: today.format('YYYY-MM-DD'), period: 'monthly' },
            { label: 'Năm nay',    from: today.startOf('year').format('YYYY-MM-DD'),  to: today.format('YYYY-MM-DD'), period: 'yearly'  },
          ].map(q => (
            <button
              key={q.label}
              onClick={() => { setFrom(q.from); setTo(q.to); setPeriod(q.period) }}
              className="text-xs border border-green-300 text-green-700 rounded-lg px-3 py-1.5 hover:bg-green-50 font-medium"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2 border-b">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition ${
              tab === t.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="text-center py-16 text-gray-400">
          <div className="inline-block w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p>Đang tải dữ liệu...</p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
           TAB: TỔNG DOANH THU
      ════════════════════════════════════════════════════════════════ */}
      {!isLoading && tab === 'total' && totalData && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-green-500 to-green-700 rounded-xl p-5 text-white shadow-lg">
              <p className="text-green-100 text-sm mb-1">Tổng doanh thu</p>
              <p className="text-2xl font-bold">{fmt(totalData.totalAmount)} ₫</p>
              <p className="text-green-200 text-xs mt-1">{totalData.fromDate} → {totalData.toDate}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow border">
              <p className="text-gray-500 text-sm mb-1">Số kỳ thống kê</p>
              <p className="text-2xl font-bold text-gray-800">{totalData.rows?.length || 0}</p>
              <p className="text-gray-400 text-xs mt-1">{PERIODS.find(p => p.value === period)?.label}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow border">
              <p className="text-gray-500 text-sm mb-1">Doanh thu trung bình / kỳ</p>
              <p className="text-2xl font-bold text-blue-600">
                {totalData.rows?.length
                  ? fmt(Number(totalData.totalAmount) / totalData.rows.length)
                  : 0} ₫
              </p>
            </div>
          </div>

          {/* Biểu đồ */}
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-gray-700 mb-4">Biểu đồ doanh thu</h3>
            {totalChartData.length === 0 ? (
              <p className="text-center text-gray-400 py-12">Không có dữ liệu</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={totalChartData} margin={{ top: 5, right: 20, bottom: 60, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={v => (v/1000000).toFixed(1) + 'M'} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="amount" name="Doanh thu" fill="#16a34a" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bảng chi tiết */}
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-gray-700 mb-4">Chi tiết theo kỳ</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-50 text-green-800 text-left">
                    <th className="px-4 py-2 font-semibold">STT</th>
                    <th className="px-4 py-2 font-semibold">Kỳ</th>
                    <th className="px-4 py-2 font-semibold text-right">Doanh thu (₫)</th>
                    <th className="px-4 py-2 font-semibold text-right">Tỷ lệ %</th>
                  </tr>
                </thead>
                <tbody>
                  {totalData.rows?.map((row, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{row.label}</td>
                      <td className="px-4 py-2 text-right text-green-700 font-semibold">
                        {fmt(row.amount)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {totalData.totalAmount > 0
                          ? ((Number(row.amount) / Number(totalData.totalAmount)) * 100).toFixed(1) + '%'
                          : '0%'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-green-50 font-bold border-t-2 border-green-200">
                    <td colSpan={2} className="px-4 py-2 text-green-800">Tổng cộng</td>
                    <td className="px-4 py-2 text-right text-green-800">{fmt(totalData.totalAmount)}</td>
                    <td className="px-4 py-2 text-right text-green-700">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
           TAB: THEO SẢN PHẨM
      ════════════════════════════════════════════════════════════════ */}
      {!isLoading && tab === 'product' && (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl p-5 text-white shadow-lg">
              <p className="text-blue-100 text-sm mb-1">Tổng doanh thu</p>
              <p className="text-2xl font-bold">
                {fmt(productData.reduce((s, p) => s + Number(p.totalAmount), 0))} ₫
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow border">
              <p className="text-gray-500 text-sm mb-1">Số sản phẩm có doanh thu</p>
              <p className="text-2xl font-bold text-gray-800">{productData.length}</p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow border">
              <p className="text-gray-500 text-sm mb-1">Tổng số lượng bán</p>
              <p className="text-2xl font-bold text-purple-600">
                {fmt(productData.reduce((s, p) => s + Number(p.totalQty), 0))}
              </p>
            </div>
          </div>

          {/* Bi��u đồ Top 15 */}
          {productChartData.length > 0 && (
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Top {Math.min(15, productData.length)} sản phẩm doanh thu cao nhất</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={productChartData} margin={{ top: 5, right: 20, bottom: 80, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={v => (v/1000000).toFixed(1) + 'M'} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="amount" name="Doanh thu" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bảng */}
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-gray-700 mb-4">Chi tiết theo sản phẩm</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-50 text-blue-800 text-left">
                    <th className="px-3 py-2">STT</th>
                    <th className="px-3 py-2">Mã SP</th>
                    <th className="px-3 py-2">Tên sản phẩm</th>
                    <th className="px-3 py-2">Danh mục</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-right">Doanh thu (₫)</th>
                    <th className="px-3 py-2 text-right">Tỷ lệ %</th>
                  </tr>
                </thead>
                <tbody>
                  {productData.map((p, i) => {
                    const grand = productData.reduce((s, x) => s + Number(x.totalAmount), 0)
                    return (
                      <tr key={p.productId} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-blue-600">{p.productCode}</td>
                        <td className="px-3 py-2 font-medium">{p.productName}</td>
                        <td className="px-3 py-2 text-gray-500">{p.categoryName}</td>
                        <td className="px-3 py-2 text-right">{fmt(p.totalQty)} {p.unit}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700">{fmt(p.totalAmount)}</td>
                        <td className="px-3 py-2 text-right text-gray-500">
                          {grand > 0 ? ((Number(p.totalAmount) / grand) * 100).toFixed(1) + '%' : '0%'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                    <td colSpan={4} className="px-3 py-2 text-blue-800">Tổng cộng</td>
                    <td className="px-3 py-2 text-right text-blue-700">
                      {fmt(productData.reduce((s, p) => s + Number(p.totalQty), 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-800">
                      {fmt(productData.reduce((s, p) => s + Number(p.totalAmount), 0))}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-700">100%</td>
                  </tr>
                </tfoot>
              </table>
              {productData.length === 0 && (
                <p className="text-center text-gray-400 py-10">Không có dữ liệu trong khoảng thời gian này</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
           TAB: THEO DANH MỤC
      ════════════════════════════════════════════════════════════════ */}
      {!isLoading && tab === 'category' && (
        <div className="space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl p-5 text-white shadow-lg">
              <p className="text-purple-100 text-sm mb-1">Tổng doanh thu</p>
              <p className="text-2xl font-bold">
                {fmt(categoryData.reduce((s, c) => s + Number(c.totalAmount), 0))} ₫
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 shadow border">
              <p className="text-gray-500 text-sm mb-1">Số danh mục có doanh thu</p>
              <p className="text-2xl font-bold text-gray-800">{categoryData.length}</p>
            </div>
          </div>

          {/* Pie chart + Bar chart */}
          {categoryChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie */}
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="font-semibold text-gray-700 mb-4">Tỷ trọng theo danh mục</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%" cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine
                    >
                      {categoryChartData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => fmt(v) + ' ₫'} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bar */}
              <div className="bg-white rounded-xl shadow p-5">
                <h3 className="font-semibold text-gray-700 mb-4">So sánh doanh thu</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={categoryChartData} layout="vertical" margin={{ left: 30, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tickFormatter={v => (v/1000000).toFixed(1) + 'M'} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={v => fmt(v) + ' ₫'} />
                    <Bar dataKey="value" name="Doanh thu" radius={[0,4,4,0]}>
                      {categoryChartData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Bảng */}
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-gray-700 mb-4">Chi tiết theo danh mục</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-purple-50 text-purple-800 text-left">
                    <th className="px-4 py-2">STT</th>
                    <th className="px-4 py-2">Danh mục</th>
                    <th className="px-4 py-2 text-right">Doanh thu (₫)</th>
                    <th className="px-4 py-2 text-right">Tỷ lệ %</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryData.map((c, i) => {
                    const grand = categoryData.reduce((s, x) => s + Number(x.totalAmount), 0)
                    return (
                      <tr key={c.categoryId} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2 font-medium flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          {c.categoryName}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-purple-700">{fmt(c.totalAmount)}</td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {grand > 0 ? ((Number(c.totalAmount) / grand) * 100).toFixed(1) + '%' : '0%'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-purple-50 font-bold border-t-2 border-purple-200">
                    <td colSpan={2} className="px-4 py-2 text-purple-800">Tổng cộng</td>
                    <td className="px-4 py-2 text-right text-purple-800">
                      {fmt(categoryData.reduce((s, c) => s + Number(c.totalAmount), 0))}
                    </td>
                    <td className="px-4 py-2 text-right text-purple-700">100%</td>
                  </tr>
                </tfoot>
              </table>
              {categoryData.length === 0 && (
                <p className="text-center text-gray-400 py-10">Không có dữ liệu trong khoảng thời gian này</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
