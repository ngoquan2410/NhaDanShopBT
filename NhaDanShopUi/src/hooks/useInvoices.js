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
    onSuccess: () => { invalidate(); toast.success('Đã tạo hóa đơn bán') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi tạo hóa đơn'),
  })
  const remove = useMutation(invoiceService.delete, {
    onSuccess: () => { invalidate(); toast.success('Đã xóa hóa đơn') },
    onError: () => toast.error('Lỗi khi xóa'),
  })

  return { create, remove }
}
