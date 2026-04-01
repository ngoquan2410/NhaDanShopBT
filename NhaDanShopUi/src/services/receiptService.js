import api from '../lib/axios'

export const receiptService = {
  getAll: (page = 0, size = 20) =>
    api.get(`/api/receipts?page=${page}&size=${size}`).then(r => r.data),
  getByDateRange: (from, to, page = 0, size = 20) =>
    api.get(`/api/receipts?from=${from}&to=${to}&page=${page}&size=${size}`).then(r => r.data),
  getOne: (id) => api.get(`/api/receipts/${id}`).then(r => r.data),
  create: (data) => api.post('/api/receipts', data).then(r => r.data),
  delete: (id) => api.delete(`/api/receipts/${id}`),

  // ── Import Excel ──────────────────────────────────────────────────────────
  /** Import phiếu nhập kho từ file .xlsx */
  importExcel: (file, supplierName, note = '', shippingFee = 0, vatPercent = 0) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('supplierName', supplierName)
    if (note) formData.append('note', note)
    if (shippingFee > 0)  formData.append('shippingFee', String(shippingFee))
    if (vatPercent > 0)   formData.append('vatPercent',  String(vatPercent))
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
