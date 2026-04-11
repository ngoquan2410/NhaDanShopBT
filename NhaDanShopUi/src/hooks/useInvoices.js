import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoiceService } from '../services/invoiceService'
import toast from 'react-hot-toast'

export const useInvoices = (page = 0, from, to) =>
  useQuery(['invoices', page, from, to], () =>
    from && to
      ? invoiceService.getByDateRange(from, to, page)
      : invoiceService.getAll(page)
  )

export const useInvoiceMutations = () => {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries(['invoices'])

  const create = useMutation(invoiceService.create, {
    onSuccess: () => { invalidate() },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi tạo hóa đơn'),
  })

  /** Soft Cancel — PATCH /api/invoices/{id}/cancel */
  const cancel = useMutation(
    ({ id, reason }) => invoiceService.cancel(id, reason),
    {
      onSuccess: (data) => {
        invalidate()
        toast.success(`✅ Đã hủy hóa đơn ${data.invoiceNo}`)
      },
      onError: (e) => {
        const msg = e?.response?.data?.message || e?.response?.data?.detail || 'Lỗi hủy hóa đơn'
        toast.error(`❌ ${msg}`)
      },
    }
  )

  const remove = useMutation(invoiceService.delete, {
    onSuccess: () => { invalidate(); toast.success('Đã xóa hóa đơn') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi khi xóa'),
  })

  return { create, cancel, remove }
}
