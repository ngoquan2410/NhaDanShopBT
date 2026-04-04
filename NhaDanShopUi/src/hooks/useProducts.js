import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productService } from '../services/productService'
import toast from 'react-hot-toast'

export const useProducts = () =>
  useQuery(['products'], productService.getAll)

export const useExpiryWarnings = (threshold = 30) =>
  useQuery(['expiry-warnings', threshold], () => productService.getExpiryWarnings(threshold))

export const useExpiredProducts = () =>
  useQuery(['expired-products'], productService.getExpired)

// ── Variants (Sprint 0) ───────────────────────────────────────────────────────
/** Lấy danh sách variants của 1 SP. enabled=false khi productId chưa có */
export const useVariants = (productId) =>
  useQuery(['variants', productId], () => productService.getVariants(productId), {
    enabled: !!productId,
    staleTime: 30_000,
  })

export const useVariantMutations = (productId) => {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries(['variants', productId])
    qc.invalidateQueries(['products'])
  }

  const create = useMutation(
    (data) => productService.createVariant(productId, data),
    { onSuccess: () => { invalidate(); toast.success('Đã thêm biến thể') },
      onError:   (e) => toast.error(e?.response?.data?.message || 'Lỗi khi thêm biến thể') }
  )
  const update = useMutation(
    ({ vid, data }) => productService.updateVariant(productId, vid, data),
    { onSuccess: () => { invalidate(); toast.success('Đã cập nhật biến thể') },
      onError:   ()  => toast.error('Lỗi khi cập nhật biến thể') }
  )
  const remove = useMutation(
    (vid) => productService.deleteVariant(productId, vid),
    { onSuccess: () => { invalidate(); toast.success('Đã xóa biến thể') },
      onError:   (e) => toast.error(e?.response?.data?.message || 'Lỗi khi xóa biến thể') }
  )
  return { create, update, remove }
}

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
