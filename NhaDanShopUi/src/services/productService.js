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
  checkAvailability: (items) =>
    api.post('/api/products/check-availability', { items }).then(r => r.data),
  getLowStockVariants: () => api.get('/api/products/low-stock-variants').then(r => r.data),

  // ── Variant CRUD (Sprint 0) ───────────────────────────────────────────────
  getVariants:    (productId)           => api.get(`/api/products/${productId}/variants`).then(r => r.data),
  createVariant:  (productId, data)     => api.post(`/api/products/${productId}/variants`, data).then(r => r.data),
  updateVariant:  (productId, vid, data)=> api.put(`/api/products/${productId}/variants/${vid}`, data).then(r => r.data),
  deleteVariant:  (productId, vid)      => api.delete(`/api/products/${productId}/variants/${vid}`),
  /** Lookup variant theo mã barcode — dùng cho BarcodeScanner + POS */
  getVariantByCode: (code) => api.get(`/api/products/variants/by-code/${encodeURIComponent(code)}`).then(r => r.data),

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
  /** Pass 1: Preview validate file Excel — KHÔNG ghi DB */
  previewExcel: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/api/products/preview-excel', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  /** Pass 2: Import thật sự — chỉ ghi DB khi preview không có lỗi */
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
