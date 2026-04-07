﻿import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportService } from '../../services/reportService'
import { productService } from '../../services/productService'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'

function StatCard({ label, value, sub, color = 'green', icon }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`border rounded-xl p-5 ${colors[color]}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  )
}

function fmt(num) {
  if (num == null) return '0'
  return Number(num).toLocaleString('vi-VN') + ' ₫'
}

export default function DashboardPage() {
  const today = dayjs().format('YYYY-MM-DD')
  const startOfMonth = dayjs().startOf('month').format('YYYY-MM-DD')
  const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD')

  const { data: monthProfit } = useQuery(['profit-month'], reportService.getProfitThisMonth)
  const { data: weekProfit } = useQuery(['profit-week'], reportService.getProfitThisWeek)
  const { data: warnings } = useQuery(['expiry-warnings', 3], () => productService.getExpiryWarnings(3))
  const { data: expired } = useQuery(['expired-products'], productService.getExpired)
  // [Sprint 0 - P0-4] Hàng sắp hết tồn kho — dùng ngưỡng per-variant
  const { data: lowStockVariants = [] } = useQuery(['low-stock-variants'], productService.getLowStockVariants)

  // Show 9AM notification
  useEffect(() => {
    const now = dayjs()
    const targetTime = now.startOf('day').add(9, 'hour')
    const diff = targetTime.diff(now)
    const notifShownKey = `nds_notif_${today}`

    const showNotif = () => {
      if (!localStorage.getItem(notifShownKey)) {
        const warnCount = warnings?.length || 0
        const expiredCount = expired?.length || 0
        if (warnCount > 0 || expiredCount > 0) {
          toast(
            `⚠️ Cảnh báo hàng hóa: ${expiredCount} lô đã hết hạn, ${warnCount} lô sắp hết hạn!`,
            { duration: 8000, style: { background: '#ef4444', color: '#fff' } }
          )
          localStorage.setItem(notifShownKey, '1')
        }
      }
    }

    if (diff > 0) {
      const timer = setTimeout(showNotif, diff)
      return () => clearTimeout(timer)
    } else {
      // already past 9AM today - show once
      showNotif()
    }
  }, [warnings, expired, today])

  const expiredList = expired || []
  const warningList = warnings || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
        <p className="text-gray-500 text-sm">{dayjs().format('dddd, DD/MM/YYYY')}</p>
      </div>

      {/* Profit summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Doanh thu tuần này"
          value={fmt(weekProfit?.totalRevenue)}
          sub={`${weekProfit?.totalInvoices || 0} hóa đơn`}
          color="blue"
          icon="📈"
        />
        <StatCard
          label="Lợi nhuận tuần này"
          value={fmt(weekProfit?.totalProfit)}
          sub={`Margin: ${weekProfit?.profitMarginPct || 0}%`}
          color="green"
          icon="💰"
        />
        <StatCard
          label="Doanh thu tháng này"
          value={fmt(monthProfit?.totalRevenue)}
          sub={`${monthProfit?.totalInvoices || 0} hóa đơn`}
          color="blue"
          icon="📊"
        />
        <StatCard
          label="Lợi nhuận tháng này"
          value={fmt(monthProfit?.totalProfit)}
          sub={`Margin: ${monthProfit?.profitMarginPct || 0}%`}
          color="green"
          icon="💵"
        />
      </div>

      {/* Expiry alerts */}
      {expiredList.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-5">
          <h3 className="text-red-700 font-bold text-lg mb-3 flex items-center gap-2">
            🚨 Lô hàng đã HẾT HẠN ({expiredList.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-red-600 border-b border-red-200">
                  <th className="text-left py-2 pr-4">Mã lô</th>
                  <th className="text-left py-2 pr-4">Sản phẩm</th>
                  <th className="text-left py-2 pr-4">Danh mục</th>
                  <th className="text-right py-2 pr-4">Còn lại</th>
                  <th className="text-right py-2">Hết hạn</th>
                </tr>
              </thead>
              <tbody>
                {expiredList.map(w => (
                  <tr key={w.batchId} className="border-b border-red-100">
                    <td className="py-2 pr-4 font-mono">{w.batchCode}</td>
                    <td className="py-2 pr-4">{w.productName}</td>
                    <td className="py-2 pr-4 text-gray-500">{w.categoryName}</td>
                    <td className="py-2 pr-4 text-right">{w.remainingQty} {w.sellUnit}</td>
                    <td className="py-2 text-right text-red-700 font-semibold">
                      {dayjs(w.expiryDate).format('DD/MM/YYYY')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {warningList.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-5">
          <h3 className="text-orange-700 font-bold text-lg mb-3 flex items-center gap-2">
            ⚠️ Lô hàng sắp hết hạn ({warningList.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-orange-600 border-b border-orange-200">
                  <th className="text-left py-2 pr-4">Mã lô</th>
                  <th className="text-left py-2 pr-4">Sản phẩm</th>
                  <th className="text-left py-2 pr-4">Danh mục</th>
                  <th className="text-right py-2 pr-4">Còn lại</th>
                  <th className="text-right py-2 pr-4">Hết hạn</th>
                  <th className="text-right py-2">Số ngày</th>
                </tr>
              </thead>
              <tbody>
                {warningList.map(w => (
                  <tr key={w.batchId} className="border-b border-orange-100">
                    <td className="py-2 pr-4 font-mono">{w.batchCode}</td>
                    <td className="py-2 pr-4">{w.productName}</td>
                    <td className="py-2 pr-4 text-gray-500">{w.categoryName}</td>
                    <td className="py-2 pr-4 text-right">{w.remainingQty} {w.sellUnit}</td>
                    <td className="py-2 pr-4 text-right">{dayjs(w.expiryDate).format('DD/MM/YYYY')}</td>
                    <td className="py-2 text-right font-semibold text-orange-600">{w.daysRemaining} ngày</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expiredList.length === 0 && warningList.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center text-green-700">
          ✅ Tất cả hàng hóa đều trong hạn sử dụng!
        </div>
      )}

      {/* [Sprint 0 - P0-4] Cảnh báo tồn kho thấp theo variant */}
      {lowStockVariants.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-5">
          <h3 className="text-yellow-700 font-bold text-lg mb-3 flex items-center gap-2">
            📦 Hàng sắp hết tồn kho ({lowStockVariants.length} biến thể)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-yellow-700 border-b border-yellow-200">
                  <th className="text-left py-2 pr-4">Mã SP</th>
                  <th className="text-left py-2 pr-4">Biến thể</th>
                  <th className="text-left py-2 pr-4">Tên</th>
                  <th className="text-right py-2 pr-4">Tồn kho</th>
                  <th className="text-right py-2">Ngưỡng tối thiểu</th>
                </tr>
              </thead>
              <tbody>
                {lowStockVariants.map(v => (
                  <tr key={v.id} className="border-b border-yellow-100">
                    <td className="py-2 pr-4 font-mono text-xs text-gray-500">{v.productCode}</td>
                    <td className="py-2 pr-4 font-mono font-bold text-yellow-700">{v.variantCode}</td>
                    <td className="py-2 pr-4">{v.variantName}</td>
                    <td className={`py-2 pr-4 text-right font-bold ${v.stockQty === 0 ? 'text-red-600' : 'text-yellow-700'}`}>
                      {v.stockQty === 0 ? '🚫 Hết hàng' : `${v.stockQty} ${v.sellUnit}`}
                    </td>
                    <td className="py-2 text-right text-gray-500">≤ {v.minStockQty} {v.sellUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
