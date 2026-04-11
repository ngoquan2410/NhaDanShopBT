import { useState } from 'react'
import { useCategories, useCategoryMutations } from '../../hooks/useCategories'
import { useSort } from '../../hooks/useSort'
import { AdminTable, AdminPageHeader, AdminCard } from '../../components/admin/AdminTable'

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
    <div className="space-y-4">
      <AdminPageHeader
        title="Quản lý Danh mục"
        actions={
          <button onClick={handleNew}
            className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
            + Thêm danh mục
          </button>
        }
      />

      <AdminCard>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm danh mục..."
          className="border rounded-lg px-3 py-2 w-full sm:max-w-xs text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3" />

        <AdminTable
          loading={isLoading}
          rows={sorted}
          emptyText="Không có danh mục nào"
          columns={[
            { key: 'id', label: 'ID', thClassName: 'w-12', tdClassName: 'text-gray-500 text-xs' },
            { key: 'name', label: 'Tên danh mục', tdClassName: 'font-medium text-gray-800' },
            { key: 'description', label: 'Mô tả', tdClassName: 'text-gray-500 text-sm', render: c => c.description || '—' },
            { key: 'active', label: 'Trạng thái', thClassName: 'text-center', tdClassName: 'text-center',
              render: c => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {c.active ? 'Hoạt động' : 'Ẩn'}
                </span>
              )},
            { key: 'actions', label: 'Thao tác', isAction: true, thClassName: 'text-center', tdClassName: 'text-center',
              render: c => (
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">✏️ Sửa</button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-800 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">🗑️ Xóa</button>
                </div>
              )},
          ]}
          mobileCard={cat => (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{cat.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cat.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {cat.active ? 'Hoạt động' : 'Ẩn'}
                  </span>
                </div>
                {cat.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{cat.description}</p>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => handleEdit(cat)}
                  className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium">✏️</button>
                <button onClick={() => handleDelete(cat.id)}
                  className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-medium">🗑️</button>
              </div>
            </div>
          )}
        />
      </AdminCard>

      {showModal && (
        <Modal title={editing ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}
          onClose={() => { setShowModal(false); setEditing(null) }}>
          <CategoryForm initial={editing} onSubmit={handleSubmit} loading={create.isLoading || update.isLoading} />
        </Modal>
      )}
    </div>
  )
}
