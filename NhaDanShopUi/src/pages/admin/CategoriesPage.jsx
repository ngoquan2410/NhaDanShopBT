import { useState } from 'react'
import { useCategories, useCategoryMutations } from '../../hooks/useCategories'
import { useSort } from '../../hooks/useSort'

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

function CategoryForm({ initial, onSubmit, loading }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [active, setActive] = useState(initial?.active ?? true)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ name, description, active })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tên danh mục *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Nhập tên danh mục"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Mô tả danh mục (tùy chọn)"
        />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" checked={active} onChange={e => setActive(e.target.checked)} />
        <label htmlFor="active" className="text-sm text-gray-700">Hoạt động</label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="bg-green-600 text-white px-5 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
          {loading ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </form>
  )
}

export default function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories()
  const { create, update, remove } = useCategoryMutations()
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )
  const { sorted, SortHeader } = useSort(filtered, 'name')

  const handleSubmit = async (data) => {
    if (editing) {
      await update.mutateAsync({ id: editing.id, data })
    } else {
      await create.mutateAsync(data)
    }
    setShowModal(false)
    setEditing(null)
  }

  const handleEdit = (cat) => { setEditing(cat); setShowModal(true) }
  const handleNew = () => { setEditing(null); setShowModal(true) }
  const handleDelete = (id) => {
    if (window.confirm('Xóa danh mục này?')) remove.mutate(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Quản lý Danh mục</h2>
        <button onClick={handleNew}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2">
          + Thêm danh mục
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm danh mục..."
          className="border rounded-lg px-3 py-2 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b text-sm">
                <SortHeader field="id" className="text-left px-4 py-3">ID</SortHeader>
                <SortHeader field="name" className="text-left px-4 py-3">Tên danh mục</SortHeader>
                <th className="text-left px-4 py-3">Mô tả</th>
                <SortHeader field="active" className="text-center px-4 py-3">Trạng thái</SortHeader>
                <th className="text-center px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
              ) : sorted.map(cat => (
                <tr key={cat.id} className="border-b hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-500">{cat.id}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{cat.name}</td>
                  <td className="px-4 py-3 text-gray-500">{cat.description || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${cat.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {cat.active ? 'Hoạt động' : 'Ẩn'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleEdit(cat)} className="text-blue-600 hover:text-blue-800 mr-3 text-xs font-medium">✏️ Sửa</button>
                    <button onClick={() => handleDelete(cat.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">🗑️ Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
          onClose={() => { setShowModal(false); setEditing(null) }}
        >
          <CategoryForm
            initial={editing}
            onSubmit={handleSubmit}
            loading={create.isLoading || update.isLoading}
          />
        </Modal>
      )}
    </div>
  )
}
