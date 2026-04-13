import api from '../lib/axios'

export const receiptService = {
  getAll: (page = 0, size = 20) =>
    api.get(`/api/receipts?page=${page}&size=${size}`).then(r => r.data),
  getByDateRange: (from, to, page = 0, size = 20) =>
    api.get(`/api/receipts?from=${from}&to=${to}&page=${page}&size=${size}`).then(r => r.data),
  getOne: (id) => api.get(`/api/receipts/${id}`).then(r => r.data),
  create: (data) => api.post('/api/receipts', data).then(r => r.data),
  /** PATCH /api/receipts/{id}/meta — sửa ghi chú, nhà cung cấp, ngày nhập */
  updateMeta: (id, data) => api.patch(`/api/receipts/${id}/meta`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/receipts/${id}`),

  // ── Import Excel ──────────────────────────────────────────────────────────
  /** Preview file Excel — KHÔNG ghi DB, trả về danh sách rows + lỗi */
  previewExcel: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/receipts/preview-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  /** Import phiếu nhập kho từ file .xlsx
   *  receiptDate: 'yyyy-MM-dd' — optional, null = hôm nay
   */
  importExcel: (file, supplierName, note = '', shippingFee = 0, vatPercent = 0, supplierId = null, receiptDate = null) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('supplierName', supplierName)
    if (note)          formData.append('note', note)
    if (shippingFee > 0)  formData.append('shippingFee', String(shippingFee))
    if (vatPercent > 0)   formData.append('vatPercent',  String(vatPercent))
    if (supplierId)       formData.append('supplierId',  String(supplierId))
    if (receiptDate)      formData.append('receiptDate', receiptDate)  // 'yyyy-MM-dd'
    return api.post('/api/receipts/import-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  /** Download file Excel template import phiếu nhập kho */
  downloadTemplate: () =>
    api.get('/api/receipts/template', { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'template_import_phieu_nhap_kho.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    }),
}
