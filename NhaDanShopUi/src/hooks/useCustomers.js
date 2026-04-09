import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customerService } from '../services/customerService'
import toast from 'react-hot-toast'

export function useCustomers(q) {
  return useQuery({
    queryKey: ['customers', q],
    queryFn: () => customerService.getAll(q || undefined),
    staleTime: 30_000,
    keepPreviousData: true,
  })
}

export function useCustomerMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['customers'] })

  const create = useMutation({
    mutationFn: customerService.create,
    onSuccess: () => { toast.success('Đã thêm khách hàng'); invalidate() },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Lỗi thêm KH'),
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => customerService.update(id, data),
    onSuccess: () => { toast.success('Đã cập nhật khách hàng'); invalidate() },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Lỗi cập nhật KH'),
  })

  const remove = useMutation({
    mutationFn: customerService.delete,
    onSuccess: () => { toast.success('Đã vô hiệu hóa khách hàng'); invalidate() },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Lỗi xóa KH'),
  })

  return { create, update, remove }
}
