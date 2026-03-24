import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productService } from '../services/productService'
import toast from 'react-hot-toast'

export const useProducts = () =>
  useQuery(['products'], productService.getAll)

export const useExpiryWarnings = (threshold = 30) =>
  useQuery(['expiry-warnings', threshold], () => productService.getExpiryWarnings(threshold))

export const useExpiredProducts = () =>
  useQuery(['expired-products'], productService.getExpired)

export const useProductMutations = () => {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries(['products'])

  const create = useMutation(productService.create, {
    onSuccess: () => { invalidate(); toast.success('Đã thêm sản phẩm') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi khi thêm sản phẩm'),
  })
  const update = useMutation(({ id, data }) => productService.update(id, data), {
    onSuccess: () => { invalidate(); toast.success('Đã cập nhật sản phẩm') },
    onError: () => toast.error('Lỗi khi cập nhật'),
  })
  const remove = useMutation(productService.delete, {
    onSuccess: () => { invalidate(); toast.success('Đã xóa sản phẩm') },
    onError: () => toast.error('Lỗi khi xóa'),
  })

  return { create, update, remove }
}
