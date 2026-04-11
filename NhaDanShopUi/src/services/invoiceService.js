import api from '../lib/axios'

export const invoiceService = {
  getAll: (page = 0, size = 20) =>
    api.get(`/api/invoices?page=${page}&size=${size}`).then(r => r.data),
  getByDateRange: (from, to, page = 0, size = 20) =>
    api.get(`/api/invoices?from=${from}&to=${to}&page=${page}&size=${size}`).then(r => r.data),
  getOne: (id) => api.get(`/api/invoices/${id}`).then(r => r.data),
  create: (data) => api.post('/api/invoices', data).then(r => r.data),
  /** Soft Cancel — đánh CANCELLED, hoàn tồn kho, không xóa vật lý */
  cancel: (id, reason) => api.patch(`/api/invoices/${id}/cancel`, { reason }).then(r => r.data),
  delete: (id) => api.delete(`/api/invoices/${id}`),
  getByCustomer: (customerId, page = 0, size = 10) =>
    api.get(`/api/invoices?customerId=${customerId}&page=${page}&size=${size}`).then(r => r.data),
}


