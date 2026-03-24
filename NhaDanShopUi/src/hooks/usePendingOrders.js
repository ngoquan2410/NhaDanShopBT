import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pendingOrderService } from '../services/pendingOrderService'
import toast from 'react-hot-toast'

// Danh sách tất cả đơn chờ (dùng ở admin + storefront để tính available qty)
// Nếu user không có quyền (403) → trả [] không crash
export function usePendingOrders() {
  return useQuery(['pending-orders'], pendingOrderService.getAll, {
    refetchInterval: 15_000,
    retry: false,
    onError: () => {}, // silent — user thường nhận 403, không cần toast
  })
}

// Polling 1 đơn (dùng ở phía khách sau khi đặt hàng online)
export function usePendingOrderById(id) {
  return useQuery(
    ['pending-orders', id],
    () => pendingOrderService.getById(id),
    {
      enabled: !!id,
      refetchInterval: (data) =>
        // Dừng polling khi đơn đã CONFIRMED hoặc CANCELLED
        data?.status === 'PENDING' ? 5_000 : false,
    }
  )
}

// Mutations: create / confirm / cancel
export function usePendingOrderMutations() {
  const qc = useQueryClient()

  const refresh = () => {
    qc.invalidateQueries(['pending-orders'])
    qc.invalidateQueries(['invoices'])
    qc.invalidateQueries(['products'])
  }

  const create = useMutation(pendingOrderService.create, {
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.response?.data?.detail
      // 409 = hàng đã bị người khác reserve
      if (err?.response?.status === 409) {
        toast.error('⚠️ ' + (msg || 'Sản phẩm vừa hết hàng, vui lòng cập nhật giỏ hàng!'))
        qc.invalidateQueries(['products'])
      } else {
        toast.error(msg || 'Lỗi khi tạo đơn hàng')
      }
    },
  })

  const confirm = useMutation(
    (id) => pendingOrderService.confirm(id),
    {
      onSuccess: () => {
        toast.success('✅ Đã xác nhận thanh toán, hóa đơn đã được tạo!')
        refresh()
      },
      onError: (err) => {
        toast.error(err?.response?.data?.message || 'Lỗi khi xác nhận')
      },
    }
  )

  const cancel = useMutation(
    ({ id, reason }) => pendingOrderService.cancel(id, reason),
    {
      onSuccess: () => {
        toast.success('Đã hủy đơn hàng')
        refresh()
      },
      onError: (err) => {
        toast.error(err?.response?.data?.message || 'Lỗi khi hủy đơn')
      },
    }
  )

  return { create, confirm, cancel }
}
