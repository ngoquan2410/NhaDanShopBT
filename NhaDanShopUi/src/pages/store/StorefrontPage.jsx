import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProducts } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { useAuth } from '../../context/AuthContext'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { invoiceService } from '../../services/invoiceService'
import { productService } from '../../services/productService'
import { pendingOrderService, ORDER_STATUS } from '../../services/pendingOrderService'
import { usePendingOrderMutations, usePendingOrderById } from '../../hooks/usePendingOrders'
import toast from 'react-hot-toast'
// ProductCard — dùng product.availableQty (BE tính trừ pending) để hiển thị và giới hạn
function ProductCard({ product, onAddToCart }) {
  const [qty, setQty] = useState(1)
  // availableQty từ BE = stockQty - tổng qty đang giữ bởi PENDING orders còn hạn
  const available = product.availableQty ?? product.stockQty
  const pendingReserved = product.stockQty - available  // đang bị giữ
  const outOfStock = available <= 0

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1 overflow-hidden border border-amber-100 flex flex-col">
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 h-36 flex items-center justify-center overflow-hidden relative">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={e => {
              e.target.style.display = 'none'
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className="absolute inset-0 flex items-center justify-center text-5xl select-none"
          style={{ display: product.imageUrl ? 'none' : 'flex' }}
        >
          {'\uD83D\uDECD'}
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <p className="text-xs text-gray-400 font-mono">{product.code}</p>
        <h3 className="font-semibold text-gray-800 text-sm leading-tight mt-0.5 flex-1">{product.name}</h3>
        <p className="text-xs text-gray-400 mt-1 mb-2">{product.categoryName}</p>
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {outOfStock && <span className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5 rounded-full">Hết hàng</span>}
          {!outOfStock && available <= 5 && <span className="bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded-full">Sắp hết</span>}
          {!outOfStock && available > 5 && <span className="text-xs text-gray-400">Còn {available} {product.sellUnit || product.unit}</span>}
          {pendingReserved > 0 && <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full">⏳ {pendingReserved} đang đặt</span>}
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-bold text-green-700">
            {Number(product.sellPrice).toLocaleString('vi-VN')} {'\u20AB'}
          </span>
          <span className="text-xs text-gray-400">/{product.sellUnit || product.unit}</span>
        </div>
        {!outOfStock && (
          <div className="flex items-center gap-1 mt-auto">
            <div className="flex items-center border rounded-lg overflow-hidden flex-1">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="px-2 py-1 text-gray-600 hover:bg-gray-100 text-sm font-bold">-</button>
              <span className="flex-1 text-center text-sm font-medium py-1">{qty}</span>
              <button onClick={() => setQty(q => Math.min(available, q + 1))}
                className="px-2 py-1 text-gray-600 hover:bg-gray-100 text-sm font-bold">+</button>
            </div>
            <button
              onClick={() => { onAddToCart(product, qty, available); setQty(1) }}
              className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap"
            >
              Thêm
            </button>
          </div>
        )}
        {outOfStock && (
          <button disabled className="mt-auto w-full bg-gray-200 text-gray-400 py-1.5 rounded-lg text-xs font-semibold cursor-not-allowed">
            Hết hàng
          </button>
        )}
      </div>
    </div>
  )
}
// CartDrawer
function CartDrawer({ cart, onClose, onUpdateQty, onRemove, onCheckout }) {
  const total = cart.reduce((s, i) => s + i.product.sellPrice * i.qty, 0)
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b text-white" style={{background:'linear-gradient(90deg,#92400e,#b45309)'}}>
          <h2 className="font-bold text-lg">{"Gi\u1ECF h\u00E0ng"} ({cart.length})</h2>
          <button onClick={onClose} className="text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">{'\uD83D\uDED2'}</div>
              <p>{"Gi\u1ECF h\u00E0ng tr\u1ED1ng"}</p>
            </div>
          )}
          {cart.map(item => (
            <div key={item.product.id} className="flex items-center gap-3 bg-amber-50 rounded-xl p-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden bg-amber-100">
                {item.product.imageUrl
                  ? <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover" onError={e=>{e.target.style.display='none'}} />
                  : '\uD83D\uDECD'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{item.product.name}</p>
                <p className="text-xs text-amber-700 font-semibold">
                  {Number(item.product.sellPrice).toLocaleString('vi-VN')} {'\u20AB'} / {item.product.sellUnit || item.product.unit}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpdateQty(item.product.id, item.qty - 1)}
                  className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-xs font-bold flex items-center justify-center">-</button>
                <span className="w-7 text-center text-sm font-semibold">{item.qty}</span>
                <button onClick={() => onUpdateQty(item.product.id, item.qty + 1)}
                  className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-xs font-bold flex items-center justify-center">+</button>
              </div>
              <button onClick={() => onRemove(item.product.id)}
                className="text-red-400 hover:text-red-600 text-lg ml-1">&times;</button>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="border-t p-4 space-y-3 bg-white">
            <div className="flex justify-between text-base font-bold">
              <span>{"T\u1ED5ng c\u1ED9ng"}:</span>
              <span className="text-amber-700 text-lg">{Number(total).toLocaleString('vi-VN')} {'\u20AB'}</span>
            </div>
            <button onClick={onCheckout}
              className="w-full text-white py-3 rounded-xl font-bold text-base transition" style={{background:'#b45309'}}>
              {"Thanh to\u00E1n"} &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
// Payment methods
const PAYMENT_METHODS = [
  { id: 'cash',     label: 'Tiền mặt',    desc: 'Thanh toán khi nhận hàng', online: false },
  { id: 'transfer', label: 'Chuyển khoản', desc: 'MB Bank: 0975505074 - Dương Thị Mỹ Linh', online: true },
  { id: 'momo',     label: 'MoMo',         desc: 'Ví MoMo: 0975505074', online: true },
  { id: 'zalopay',  label: 'ZaloPay',      desc: 'Zalo: 0975505074', online: true },
]

// Modal chờ xác nhận thanh toán online — polling trạng thái từ BE
function PendingOrderStatusModal({ pendingOrderId, onClose, onConfirmed }) {
  const { data: order, isLoading } = usePendingOrderById(pendingOrderId)

  // Khi đơn được xác nhận → thông báo + chuyển sang OrderSuccessModal
  useEffect(() => {
    if (order?.status === ORDER_STATUS.CONFIRMED && order?.invoice) {
      toast.success('🎉 Admin đã xác nhận thanh toán!')
      onConfirmed(order.invoice)
    }
    if (order?.status === ORDER_STATUS.CANCELLED) {
      toast.error('❌ Đơn hàng đã bị hủy. Vui lòng liên hệ shop để được hỗ trợ.')
    }
  }, [order?.status])

  const isCancelled  = order?.status === ORDER_STATUS.CANCELLED
  const isConfirmed  = order?.status === ORDER_STATUS.CONFIRMED
  const method = PAYMENT_METHODS.find(m => m.id === order?.paymentMethod)

  // Countdown
  const [minsLeft, setMinsLeft] = useState(null)
  useEffect(() => {
    if (!order?.expiresAt) return
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(order.expiresAt) - Date.now()) / 60000))
      setMinsLeft(diff)
    }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [order?.expiresAt])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-lg">Trạng thái đơn hàng</h3>
          {/* Luôn có nút X — user có thể đóng bất cứ lúc nào */}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          {isLoading && !order && (
            <div className="text-center py-6 text-gray-400">Đang tải...</div>
          )}

          {order && (
            <>
              <div className="text-center">
                <div className="text-4xl mb-2">
                  {isCancelled ? '❌' : isConfirmed ? '✅' : '⏳'}
                </div>
                <p className="font-mono font-bold text-amber-700 text-sm">{order.orderNo}</p>
                <p className={`text-sm font-semibold mt-1 ${
                  isCancelled ? 'text-red-600' : isConfirmed ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {isCancelled ? 'Đơn đã bị hủy' : isConfirmed ? 'Đã xác nhận thanh toán!' : 'Đang chờ admin xác nhận...'}
                </p>
              </div>

              {/* Thông tin thanh toán — chỉ hiện khi PENDING */}
              {!isCancelled && !isConfirmed && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-1">
                  <p className="font-semibold text-amber-800">{method?.label}</p>
                  <p className="text-amber-700">{method?.desc}</p>
                  <p className="font-mono font-bold text-amber-900 text-base mt-1">
                    {Number(order.totalAmount).toLocaleString('vi-VN')} ₫
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Vui lòng chuyển đúng số tiền. Admin sẽ xác nhận sau khi kiểm tra biến động số dư.
                  </p>
                  {minsLeft !== null && (
                    <p className={`text-xs font-semibold mt-1 ${minsLeft <= 5 ? 'text-red-600' : 'text-orange-600'}`}>
                      ⏱ Đơn hàng hết hạn sau {minsLeft} phút
                    </p>
                  )}
                </div>
              )}

              {/* Đang polling */}
              {!isCancelled && !isConfirmed && (
                <div className="flex items-center gap-2 text-xs text-gray-500 justify-center">
                  <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  Đang theo dõi trạng thái... (tự động cập nhật)
                </div>
              )}

              {/* Nút đóng — luôn hiện */}
              <button onClick={onClose}
                className="w-full border border-gray-300 rounded-xl py-2.5 text-gray-600 hover:bg-gray-50 font-medium text-sm transition">
                {isCancelled ? 'Đóng' : isConfirmed ? 'Đóng' : 'Đóng (đơn vẫn đang chờ xác nhận)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// CheckoutModal — phân luồng tiền mặt vs online
function CheckoutModal({ cart, onClose, onCashSuccess, onPendingCreated }) {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [customerName, setCustomerName] = useState(user?.fullName || user?.username || '')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [stockConflicts, setStockConflicts] = useState([]) // lỗi tồn kho realtime
  const [checking, setChecking] = useState(false)
  const total = cart.reduce((s, i) => s + i.product.sellPrice * i.qty, 0)

  // Tiền mặt → tạo invoice ngay (flow cũ)
  const createInvoice = useMutation(invoiceService.create, {
    onSuccess: (inv) => {
      toast.success('Đặt hàng thành công!')
      onCashSuccess(inv)
    },
    onError: (e) => toast.error(e?.response?.data?.detail || e?.response?.data?.message || 'Lỗi khi tạo đơn hàng'),
  })

  // Online → tạo pending order
  const { create: createPending } = usePendingOrderMutations()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) { navigate('/login'); return }

    // ── Bước 1: Validate tồn kho realtime từ BE ──────────────────────────────
    setChecking(true)
    setStockConflicts([])
    try {
      const checkResult = await productService.checkAvailability(
        cart.map(i => ({ productId: i.product.id, quantity: i.qty }))
      )
      if (!checkResult.allAvailable) {
        setStockConflicts(checkResult.conflicts)
        // Invalidate products cache → UI cập nhật availableQty mới nhất
        qc.invalidateQueries(['products'])
        setChecking(false)
        return // Dừng, không submit
      }
    } catch (err) {
      // Nếu check thất bại (network...) vẫn cho phép submit, BE sẽ validate lại
      console.warn('Stock check failed, proceeding:', err)
    }
    setChecking(false)

    // ── Bước 2: Submit đơn hàng ───────────────────────────────────────────────
    const method = PAYMENT_METHODS.find(m => m.id === paymentMethod)
    const payload = {
      customerName,
      note: [note, `[${method?.label}]`].filter(Boolean).join(' | '),
      paymentMethod,
      items: cart.map(i => ({ productId: i.product.id, quantity: i.qty })),
    }

    if (paymentMethod === 'cash') {
      createInvoice.mutate(payload)
    } else {
      try {
        const pending = await createPending.mutateAsync(payload)
        onPendingCreated(pending)
      } catch {
        // Error đã xử lý trong usePendingOrderMutations
      }
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">{'🔒'}</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Cần đăng nhập</h3>
          <p className="text-gray-500 text-sm mb-6">Vui lòng đăng nhập để tiếp tục thanh toán</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border rounded-xl py-2.5 text-gray-600 hover:bg-gray-50">Hủy</button>
            <button onClick={() => navigate('/login')} className="flex-1 text-white rounded-xl py-2.5 font-semibold" style={{background:'#b45309'}}>
              Đăng nhập
            </button>
          </div>
        </div>
      </div>
    )
  }

  const selectedMethod = PAYMENT_METHODS.find(m => m.id === paymentMethod)
  const isLoading = checking || createInvoice.isLoading || createPending.isLoading

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-lg">Xác nhận đơn hàng</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Họ tên người đặt" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Ghi chú đặc biệt..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phương thức thanh toán</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m.id} type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${paymentMethod === m.id
                    ? 'border-amber-500 bg-amber-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}>
                  <div className="font-medium text-sm">{m.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-tight">{m.desc}</div>
                </button>
              ))}
            </div>
            {selectedMethod?.online && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm space-y-1">
                <p className="font-semibold text-amber-800">Thông tin thanh toán:</p>
                <p className="text-amber-700">{selectedMethod.desc}</p>
                <p className="text-amber-700 font-mono font-bold">
                  Số tiền: {Number(total).toLocaleString('vi-VN')} ₫
                </p>
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-800">
                  <p className="font-semibold">⚠️ Lưu ý quan trọng:</p>
                  <p>Sau khi đặt hàng, bạn sẽ thấy màn hình chờ. Hãy chuyển khoản rồi đợi admin xác nhận. Hóa đơn chỉ được tạo SAU KHI admin xác nhận đã nhận tiền.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Cảnh báo tồn kho không đủ (realtime từ BE) ───────────────── */}
          {stockConflicts.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-3 space-y-2">
              <p className="text-sm font-bold text-red-700">⚠️ Một số sản phẩm không đủ hàng:</p>
              {stockConflicts.map((c, i) => (
                <div key={i} className="text-sm text-red-600 flex items-start gap-2">
                  <span className="mt-0.5">•</span>
                  <span>
                    <span className="font-semibold">{c.productName}</span>
                    {' — '}
                    {c.available === 0
                      ? 'Đã hết hàng (đang có đơn chờ xác nhận)'
                      : `Chỉ còn ${c.available} ${c.unit} (bạn đang chọn ${c.requested})`}
                  </span>
                </div>
              ))}
              <p className="text-xs text-red-500 mt-1">
                Vui lòng cập nhật số lượng trong giỏ hàng trước khi tiếp tục.
              </p>
            </div>
          )}

          {/* Tóm tắt đơn */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700 mb-2">Sản phẩm đặt:</p>
            {cart.map(i => (
              <div key={i.product.id} className="flex justify-between text-sm text-gray-600">
                <span className="truncate flex-1">{i.product.name} x {i.qty}</span>
                <span className="font-medium ml-2 whitespace-nowrap">
                  {(i.product.sellPrice * i.qty).toLocaleString('vi-VN')} ₫
                </span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-bold text-base">
              <span>Tổng:</span>
              <span className="text-amber-700">{Number(total).toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>

          <button type="submit" disabled={isLoading}
            className="w-full text-white py-3 rounded-xl font-bold text-base transition disabled:opacity-60 flex items-center justify-center gap-2"
            style={{background: stockConflicts.length > 0 ? '#9ca3af' : '#b45309'}}>
            {checking
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Đang kiểm tra hàng...</>
              : isLoading
                ? 'Đang xử lý...'
                : paymentMethod === 'cash'
                  ? '✅ Xác nhận đặt hàng (Tiền mặt)'
                  : '📤 Gửi đơn hàng → Chờ xác nhận thanh toán'}
          </button>
        </form>
      </div>
    </div>
  )
}
// OrderSuccessModal
function OrderSuccessModal({ invoice, onClose }) {
  const isOnline = invoice.paymentMethod && invoice.paymentMethod !== 'cash'
  const handlePrint = () => {
    const fmt = n => Number(n).toLocaleString('vi-VN')
    const items = (invoice.items || []).map(i =>
      '<tr><td>' + i.productName + '</td><td align="center">' + i.quantity + '</td><td align="right">' + fmt(i.unitPrice) + ' \u20AB</td><td align="right">' + fmt(i.lineTotal || i.quantity * i.unitPrice) + ' \u20AB</td></tr>'
    ).join('')
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hoa don</title>'
      + '<style>body{font-family:sans-serif;padding:20px;font-size:13px}h2{text-align:center;color:#92400e}'
      + 'p{margin:3px 0}table{width:100%;border-collapse:collapse;margin-top:12px}'
      + 'th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}th{background:#fef3c7}'
      + '.total{font-size:15px;font-weight:bold;color:#92400e}</style></head>'
      + '<body><h2>NHA DAN SHOP</h2>'
      + '<p>235, Ap 5, Xa Mo Cay, Tinh Vinh Long</p>'
      + '<p>SDT: 0975 505 074 - 0996 425 503</p><hr/>'
      + '<p><b>Hoa don:</b> ' + invoice.invoiceNo + '</p>'
      + '<p><b>Ngay:</b> ' + new Date().toLocaleString('vi-VN') + '</p>'
      + '<p><b>Khach hang:</b> ' + (invoice.customerName || 'Khach le') + '</p>'
      + '<table><tr><th>San pham</th><th>SL</th><th>Don gia</th><th>Thanh tien</th></tr>'
      + items + '</table>'
      + '<p class="total" style="text-align:right;margin-top:12px">Tong cong: ' + fmt(invoice.totalAmount) + ' \u20AB</p>'
      + '<p style="text-align:center;margin-top:20px;font-size:11px;color:#666">Cam on quy khach!</p>'
      + '</body></html>'
    const win = window.open('', '_blank', 'width=420,height=620')
    if (win) { win.document.write(html); win.document.close(); win.focus(); win.print() }
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="text-6xl mb-4">{isOnline ? '\uD83D\uDCB3' : '\uD83C\uDF89'}</div>
        <h3 className="text-xl font-bold text-gray-800 mb-1">{"\u0110\u1EB7t h\u00E0ng th\u00E0nh c\u00F4ng!"}</h3>
        <p className="text-gray-500 text-sm mb-1">{"M\u00E3 \u0111\u01A1n h\u00E0ng"}: <span className="font-mono font-bold text-amber-700">{invoice.invoiceNo}</span></p>
        <p className="text-gray-500 text-sm mb-3">{"T\u1ED5ng ti\u1EC1n"}: <span className="font-bold text-amber-700">{Number(invoice.totalAmount).toLocaleString('vi-VN')} {'\u20AB'}</span></p>
        {isOnline && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-left">
            <p className="font-semibold text-amber-800">{"Ch\u1EDD x\u00E1c nh\u1EADn thanh to\u00E1n"}</p>
            <p className="text-amber-700 text-xs mt-1">{"Admin s\u1EBD li\u00EAn h\u1EC7 x\u00E1c nh\u1EADn \u0111\u01A1n h\u00E0ng sau khi ki\u1EC3m tra thanh to\u00E1n."}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={handlePrint}
            className="flex-1 border border-amber-600 text-amber-700 rounded-xl py-2.5 font-semibold hover:bg-amber-50">
            {"In h\u00F3a \u0111\u01A1n"}
          </button>
          <button onClick={onClose}
            className="flex-1 text-white rounded-xl py-2.5 font-semibold" style={{background:'#b45309'}}>
            {"\u0110\u00F3ng"}
          </button>
        </div>
      </div>
    </div>
  )
}
// Main Storefront
export default function StorefrontPage() {
  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const [selectedCat, setSelectedCat] = useState('all')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('all')
  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [pendingOrderId, setPendingOrderId] = useState(null)  // đang chờ admin xác nhận
  const [successInvoice, setSuccessInvoice] = useState(null)  // hóa đơn đã được tạo
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const addToCart = useCallback((product, qty, effectiveQty) => {
    // effectiveQty = availableQty truyền từ ProductCard (BE đã tính trừ pending)
    const available = effectiveQty ?? product.availableQty ?? product.stockQty
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      const currentInCart = existing?.qty || 0
      if (currentInCart + qty > available) {
        toast.error(`Chỉ còn ${available} ${product.sellUnit || product.unit} có thể đặt!`)
        return prev
      }
      if (existing) {
        toast.success('Đã thêm ' + product.name)
        return prev.map(i => i.product.id === product.id
          ? { ...i, qty: i.qty + qty } : i)
      }
      toast.success('Đã thêm ' + product.name + ' vào giỏ')
      return [...prev, { product, qty }]
    })
  }, [])

  const updateQty = useCallback((productId, newQty) => {
    if (newQty <= 0) setCart(prev => prev.filter(i => i.product.id !== productId))
    else setCart(prev => prev.map(i => i.product.id === productId ? { ...i, qty: newQty } : i))
  }, [])

  const removeFromCart = useCallback((productId) => {
    setCart(prev => prev.filter(i => i.product.id !== productId))
  }, [])

  // Tiền mặt → invoice tạo ngay
  const handleCashSuccess = (invoice) => {
    setCart([])
    setShowCheckout(false)
    setShowCart(false)
    setSuccessInvoice(invoice)
  }

  // Online → pending order được tạo, chờ admin xác nhận
  const handlePendingCreated = (pending) => {
    setCart([])
    setShowCheckout(false)
    setShowCart(false)
    setPendingOrderId(pending.id)
  }

  // Admin đã xác nhận → invoice được tạo, hiển thị thành công
  const handlePendingConfirmed = (invoice) => {
    setPendingOrderId(null)
    setSuccessInvoice(invoice)
  }

  const activeProducts = useMemo(() => products.filter(p => p.active), [products])
  const hotProducts = useMemo(() =>
    [...activeProducts].filter(p => p.stockQty > 0).sort((a, b) => b.stockQty - a.stockQty).slice(0, 12),
    [activeProducts])
  const filteredProducts = useMemo(() => {
    let list = tab === 'hot' ? hotProducts : activeProducts
    if (selectedCat !== 'all') list = list.filter(p => String(p.categoryId) === selectedCat)
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.code.toLowerCase().includes(s) ||
        (p.categoryName || '').toLowerCase().includes(s))
    }
    return list
  }, [activeProducts, hotProducts, selectedCat, search, tab])
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-8 text-white" style={{background:'linear-gradient(135deg,#92400e 0%,#b45309 60%,#d97706 100%)'}}>
        <h1 className="text-3xl font-bold mb-2">{"Nh\u00E3 \u0110an Shop"}</h1>
        <p className="text-amber-100 text-lg">{"H\u00E0ng t\u01B0\u01A1i ngon \u2013 Gi\u00E1 c\u1EA3 h\u1EE3p l\u00FD \u2013 Ph\u1EE5c v\u1EE5 t\u1EADn t\u00E2m"}</p>
        <div className="mt-4 relative max-w-md">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={"T\u00ECm ki\u1EBFm s\u1EA3n ph\u1EA9m..."}
            className="w-full rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-300 pr-10" />
          <span className="absolute right-3 top-3 text-gray-400">{'\uD83D\uDD0D'}</span>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex gap-3">
        <button onClick={() => setTab('all')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${tab === 'all' ? 'text-white shadow-md' : 'bg-white text-gray-600 border hover:bg-amber-50'}`}
          style={tab === 'all' ? {background:'#b45309'} : {}}>
          {"T\u1EA5t c\u1EA3 s\u1EA3n ph\u1EA9m"}
        </button>
        <button onClick={() => setTab('hot')}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition ${tab === 'hot' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
          {"B\u00E1n ch\u1EA1y nh\u1EA5t"}
        </button>
      </div>
      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelectedCat('all')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${selectedCat === 'all' ? 'text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
          style={selectedCat === 'all' ? {background:'#b45309'} : {}}>
          {"T\u1EA5t c\u1EA3"}
        </button>
        {categories.filter(c => c.active).map(cat => (
          <button key={cat.id} onClick={() => setSelectedCat(String(cat.id))}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${selectedCat === String(cat.id) ? 'text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}
            style={selectedCat === String(cat.id) ? {background:'#b45309'} : {}}>
            {cat.name}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500">
        {"Hi\u1EC3n th\u1ECB"} <span className="font-semibold text-gray-700">{filteredProducts.length}</span> {"s\u1EA3n ph\u1EA9m"}
      </p>
      {/* Products grid */}
      {isLoading ? (
        <div className="text-center py-20 text-gray-400 text-lg">{"Ang t\u1EA3i s\u1EA3n ph\u1EA9m..."}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">{'\uD83D\uDD0D'}</div>
          <p>{"Kh\u00F4ng t\u00ECm th\u1EA5y s\u1EA3n ph\u1EA9m ph\u00F9 h\u1EE3p"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredProducts.map(p => (
            <ProductCard key={p.id} product={p} onAddToCart={addToCart} />
          ))}
        </div>
      )}
      {/* Floating Cart */}
      {cartCount > 0 && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-6 right-6 text-white rounded-full shadow-2xl p-4 flex items-center gap-2 z-40 transition-all hover:scale-105"
          style={{background:'#b45309'}}>
          <span className="text-xl">{'\uD83D\uDED2'}</span>
          <span className="font-bold">{cartCount}</span>
          <span className="text-sm hidden sm:inline">{"gi\u1ECF h\u00E0ng"}</span>
        </button>
      )}
      {showCart && (
        <CartDrawer cart={cart} onClose={() => setShowCart(false)}
          onUpdateQty={updateQty} onRemove={removeFromCart}
          onCheckout={() => { setShowCart(false); setShowCheckout(true) }} />
      )}
      {showCheckout && (
        <CheckoutModal
          cart={cart}
          onClose={() => setShowCheckout(false)}
          onCashSuccess={handleCashSuccess}
          onPendingCreated={handlePendingCreated}
        />
      )}
      {/* Đơn online đang chờ admin xác nhận */}
      {pendingOrderId && (
        <PendingOrderStatusModal
          pendingOrderId={pendingOrderId}
          onClose={() => setPendingOrderId(null)}
          onConfirmed={handlePendingConfirmed}
        />
      )}
      {/* Hóa đơn đã hoàn tất (tiền mặt hoặc sau khi admin confirm online) */}
      {successInvoice && (
        <OrderSuccessModal invoice={successInvoice} onClose={() => setSuccessInvoice(null)} />
      )}
    </div>
  )
}