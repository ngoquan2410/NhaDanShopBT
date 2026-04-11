import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { receiptService } from '../services/receiptService'
import toast from 'react-hot-toast'

export const useReceipts = (page = 0, from, to) =>
  useQuery(['receipts', page, from, to], () =>
    from && to
      ? receiptService.getByDateRange(from, to, page)
      : receiptService.getAll(page)
  )

export const useReceiptMutations = () => {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries(['receipts'])

  const create = useMutation(receiptService.create, {
    onSuccess: () => { invalidate(); toast.success('Đã tạo phiếu nhập') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi tạo phiếu nhập'),
  })
  const updateMeta = useMutation(
    ({ id, data }) => receiptService.updateMeta(id, data),
    {
      onSuccess: () => { invalidate(); toast.success('Đã cập nhật thông tin phiếu') },
      onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi cập nhật phiếu'),
    }
  )
  const remove = useMutation(receiptService.delete, {
    onSuccess: () => { invalidate(); toast.success('Đã xóa phiếu nhập') },
    onError: (e) => {
      const msg = e?.response?.data?.message || e?.response?.data?.detail || 'Lỗi khi xóa'
      toast.error(msg)
    },
  })

  return { create, updateMeta, remove }
}
