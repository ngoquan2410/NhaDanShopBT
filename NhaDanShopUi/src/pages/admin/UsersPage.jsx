import { useState } from 'react'
import { useUsers, useUserMutations } from '../../hooks/useUsers'
import dayjs from 'dayjs'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function UserForm({ initial, onSubmit, loading }) {
  const isEdit = !!initial
  const [username, setUsername] = useState(initial?.username || '')
  const [fullName, setFullName] = useState(initial?.fullName || '')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(initial?.roles?.includes('ROLE_ADMIN') || false)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)

  const handleSubmit = (e) => {
    e.preventDefault()
    const roles = new Set(['ROLE_USER'])
    if (isAdmin) roles.add('ROLE_ADMIN')
    const data = isEdit
      ? { fullName, password: password || undefined, isActive, roles: [...roles] }
      : { username, fullName, password, roles: [...roles] }
    onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập *</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            placeholder="Nhập tên đăng nhập" />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
        <input value={fullName} onChange={e => setFullName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
          placeholder="Họ và tên" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Mật khẩu {isEdit ? '(để trống nếu không đổi)' : '*'}
        </label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          required={!isEdit} minLength={6}
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
          placeholder={isEdit ? 'Nhập mật khẩu mới (tùy chọn)' : 'Tối thiểu 6 ký tự'} />
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
          Quyền Admin
        </label>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Tài khoản hoạt động
          </label>
        )}
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={loading}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
          {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo người dùng'}
        </button>
      </div>
    </form>
  )
}

export default function UsersPage() {
  const [page, setPage] = useState(0)
  const { data, isLoading } = useUsers(page)
  const { create, update, remove } = useUserMutations()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  const users = data?.content || []
  const totalPages = data?.totalPages || 1

  const handleSubmit = async (formData) => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, data: formData })
    } else {
      await create.mutateAsync(formData)
    }
    setShowModal(false); setEditing(null)
  }

  const handleEdit = (u) => { setEditing(u); setShowModal(true) }
  const handleDelete = (id) => {
    if (window.confirm('Vô hiệu hóa người dùng này?')) remove.mutate(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Quản lý Người dùng</h2>
        <button onClick={() => { setEditing(null); setShowModal(true) }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          + Thêm người dùng
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="text-left px-4 py-3">ID</th>
                <th className="text-left px-4 py-3">Tên đăng nhập</th>
                <th className="text-left px-4 py-3">Họ tên</th>
                <th className="text-left px-4 py-3">Vai trò</th>
                <th className="text-center px-4 py-3">Trạng thái</th>
                <th className="text-left px-4 py-3">Ngày tạo</th>
                <th className="text-center px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Không có người dùng</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500">{u.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                  <td className="px-4 py-3">{u.fullName || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {[...u.roles].map(r => (
                        <span key={r} className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r === 'ROLE_ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>{r.replace('ROLE_', '')}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {u.isActive ? 'Hoạt động' : 'Vô hiệu'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {dayjs(u.createdAt).format('DD/MM/YYYY')}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <button onClick={() => handleEdit(u)} className="text-blue-600 hover:text-blue-800 mr-2 text-xs">✏️ Sửa</button>
                    <button onClick={() => handleDelete(u.id)} className="text-red-600 hover:text-red-800 text-xs">🗑️ Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between pt-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">← Trước</button>
          <span className="text-sm text-gray-500">Trang {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3 py-1 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-100">Sau →</button>
        </div>
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
          onClose={() => { setShowModal(false); setEditing(null) }}
        >
          <UserForm initial={editing} onSubmit={handleSubmit} loading={create.isLoading || update.isLoading} />
        </Modal>
      )}
    </div>
  )
}
