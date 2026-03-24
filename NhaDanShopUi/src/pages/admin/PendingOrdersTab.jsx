import { useState } from 'react'
import dayjs from 'dayjs'
import { usePendingOrders, usePendingOrderMutations } from '../../hooks/usePendingOrders'

const STATUS_LABEL = {
  PENDING:   { text: 'Chờ xác nhận', cls: 'bg-yellow-100 text-yellow-800' },
  CONFIRMED: { text: 'Đã xác nhận',  cls: 'bg-green-100 text-green-700'  },
  CANCELLED: { text: 'Đã hủy',       cls: 'bg-red-100 text-red-600'      },
}

const METHOD_LABEL = {
  transfer: '🏦 Chuyển khoản',
  momo:     '💜 MoMo',
  zalopay:  '🔵 ZaloPay',
  cash:     '💵 Tiền mặt',
}

function CountdownBadge({ expiresAt }) {
  const diff = dayjs(expiresAt).diff(dayjs(), 'minute')
  if (diff <= 0) return <span className="text-red-600 text-xs font-semibold">Hết hạn</span>
  return (
    <span className={`text-xs font-semibold ${diff <= 5 ? 'text-red-600' : 'text-orange-600'}`}>
      ⏱ Còn {diff} phút
    </span>
  )
}

function OrderDetail({ order, onConfirm, onCancel, confirmLoading, cancelLoading }) {
  const [showItems, setShowItems] = useState(false)
  const status = STATUS_LABEL[order.status] || STATUS_LABEL.PENDING
  const isPending = order.status === 'PENDING'

  return (
    <div className={`rounded-xl border-2 p-4 ${isPending ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-amber-800 text-sm">{order.orderNo}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.text}</span>
            {isPending && order.expiresAt && <CountdownBadge expiresAt={order.expiresAt} />}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            👤 <span className="font-medium">{order.customerName || 'Khách lẻ'}</span>
            {' · '}🕐 {dayjs(order.createdAt).format('DD/MM/YYYY HH:mm')}
          </p>
          <p className="text-sm text-gray-500">
            {METHOD_LABEL[order.paymentMethod] || order.paymentMethod}
            {order.note && <span className="ml-2 text-xs text-gray-400">| {order.note}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-amber-700">
            {Number(order.totalAmount).toLocaleString('vi-VN')} ₫
          </p>
          <button
            onClick={() => setShowItems(v => !v)}
            className="text-xs text-blue-600 hover:underline mt-1"
          >
            {showItems ? '▲ Ẩn' : '▼ Xem'} {order.items?.length || 0} sản phẩm
          </button>
        </div>
      </div>

      {/* Items */}
      {showItems && (
        <div className="mb-3 rounded-lg overflow-hidden border border-gray-200 text-sm">
          <table className="w-full">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">Sản phẩm</th>
                <th className="text-right px-3 py-2">SL</th>
                <th className="text-right px-3 py-2">Đơn giá</th>
                <th className="text-right px-3 py-2">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((it, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{it.productName}</td>
                  <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                  <td className="px-3 py-2 text-right">{Number(it.unitPrice).toLocaleString('vi-VN')} ₫</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {Number((it.lineTotal ?? it.unitPrice * it.quantity)).toLocaleString('vi-VN')} ₫
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onConfirm(order.id)}
            disabled={confirmLoading}
            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 transition"
          >
            {confirmLoading ? 'Đang xử lý...' : '✅ Xác nhận đã nhận tiền'}
          </button>
          <button
            onClick={() => onCancel(order.id)}
            disabled={cancelLoading}
            className="flex-1 sm:flex-none border border-red-300 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 transition"
          >
            {cancelLoading ? 'Đang hủy...' : '❌ Hủy đơn'}
          </button>
          <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            <p className="font-semibold">Hướng dẫn xác nhận:</p>
            <p>Kiểm tra biến động số dư tài khoản, sau đó bấm xác nhận. Hệ thống sẽ tự tạo hóa đơn và trừ kho.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PendingOrdersTab() {
  const { data: orders = [], isLoading, refetch } = usePendingOrders()
  const { confirm, cancel } = usePendingOrderMutations()
  const [filter, setFilter] = useState('PENDING')

  const filtered = filter === 'ALL'
    ? orders
    : orders.filter(o => o.status === filter)

  const pendingCount = orders.filter(o => o.status === 'PENDING').length

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'PENDING',   label: `⏳ Chờ xác nhận${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          { key: 'CONFIRMED', label: '✅ Đã xác nhận' },
          { key: 'CANCELLED', label: '❌ Đã hủy' },
          { key: 'ALL',       label: '📋 Tất cả' },
        ].map(({ key, label }) => (
          <button key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === key
                ? key === 'PENDING' ? 'bg-yellow-500 text-white' : 'bg-gray-800 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={() => refetch()}
          className="ml-auto text-xs text-gray-500 hover:text-gray-700 border rounded-lg px-3 py-1.5">
          🔄 Làm mới
        </button>
      </div>

      {/* Pending alert banner */}
      {pendingCount > 0 && filter === 'PENDING' && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-3 text-sm text-yellow-800 flex items-center gap-2">
          <span className="text-xl">🔔</span>
          <span>
            Có <strong>{pendingCount}</strong> đơn hàng đang chờ bạn xác nhận thanh toán.
            Kiểm tra biến động tài khoản ngân hàng / MoMo / ZaloPay trước khi xác nhận.
          </span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p>Không có đơn hàng nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <OrderDetail
              key={order.id}
              order={order}
              onConfirm={(id) => confirm.mutate(id)}
              onCancel={(id) => cancel.mutate({ id, reason: 'Admin hủy' })}
              confirmLoading={confirm.isLoading}
              cancelLoading={cancel.isLoading}
            />
          ))}
        </div>
      )}
    </div>
  )
}
