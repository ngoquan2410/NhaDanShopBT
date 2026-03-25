import api from '../lib/axios'

export const productService = {
  getAll: () => api.get('/api/products').then(r => r.data),
  getByCategory: (categoryId, page = 0, size = 20) =>
    api.get(`/api/products/category/${categoryId}?page=${page}&size=${size}`).then(r => r.data),
  getOne: (id) => api.get(`/api/products/${id}`).then(r => r.data),
  getNextCode: (categoryId) => api.get(`/api/products/next-code?categoryId=${categoryId}`).then(r => r.data.code),
  create: (data) => api.post('/api/products', data).then(r => r.data),
  update: (id, data) => api.put(`/api/products/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/products/${id}`),
  getExpiryWarnings: (threshold = 30) =>
    api.get(`/api/products/expiry-warnings?threshold=${threshold}`).then(r => r.data),
  getExpired: () => api.get('/api/products/expired').then(r => r.data),
  // Kiểm tra tồn kho khả dụng (trừ pending) trước khi checkout
  checkAvailability: (items) =>
    api.post('/api/products/check-availability', { items }).then(r => r.data),

  // ── Image upload to Google Drive ──────────────────────────────────────────
  /** Upload ảnh lên Google Drive, trả về { url, message } */
  uploadImage: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  /** Kiểm tra Google Drive đã cấu hình chưa */
  getDriveStatus: () => api.get('/api/images/status').then(r => r.data),
  /** Xóa ảnh khỏi Drive */
  deleteImage: (url) => api.delete(`/api/images?url=${encodeURIComponent(url)}`),

  // ── Import Excel ──────────────────────────────────────────────────────────
  /** Import sản phẩm hàng loạt từ file .xlsx */
  importExcel: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/products/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  /** Download file Excel template import sản phẩm */
  downloadTemplate: () =>
    api.get('/api/products/template', { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'template_import_san_pham.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    }),
}
