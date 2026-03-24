import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userService } from '../services/userService'
import toast from 'react-hot-toast'

export const useUsers = (page = 0) =>
  useQuery(['users', page], () => userService.getAll(page))

export const useUserMutations = () => {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries(['users'])

  const create = useMutation(userService.create, {
    onSuccess: () => { invalidate(); toast.success('Đã tạo người dùng') },
    onError: (e) => toast.error(e?.response?.data?.message || 'Lỗi tạo người dùng'),
  })
  const update = useMutation(({ id, data }) => userService.update(id, data), {
    onSuccess: () => { invalidate(); toast.success('Đã cập nhật người dùng') },
    onError: () => toast.error('Lỗi cập nhật'),
  })
  const remove = useMutation(userService.delete, {
    onSuccess: () => { invalidate(); toast.success('Đã vô hiệu hóa người dùng') },
    onError: () => toast.error('Lỗi khi xóa'),
  })

  return { create, update, remove }
}
