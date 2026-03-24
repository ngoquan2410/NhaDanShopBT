import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { categoryService } from '../services/categoryService'
import toast from 'react-hot-toast'

export const useCategories = () =>
  useQuery(['categories'], categoryService.getAll)

export const useCategoryMutations = () => {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries(['categories'])

  const create = useMutation(categoryService.create, {
    onSuccess: () => { invalidate(); toast.success('Đã thêm danh mục') },
    onError: () => toast.error('Lỗi khi thêm danh mục'),
  })
  const update = useMutation(({ id, data }) => categoryService.update(id, data), {
    onSuccess: () => { invalidate(); toast.success('Đã cập nhật danh mục') },
    onError: () => toast.error('Lỗi khi cập nhật'),
  })
  const remove = useMutation(categoryService.delete, {
    onSuccess: () => { invalidate(); toast.success('Đã xóa danh mục') },
    onError: () => toast.error('Lỗi khi xóa'),
  })

  return { create, update, remove }
}
