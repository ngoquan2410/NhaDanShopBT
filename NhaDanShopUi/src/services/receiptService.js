import api from '../lib/axios'

export const receiptService = {
  getAll: (page = 0, size = 20) =>
    api.get(`/api/receipts?page=${page}&size=${size}`).then(r => r.data),
  getByDateRange: (from, to, page = 0, size = 20) =>
    api.get(`/api/receipts?from=${from}&to=${to}&page=${page}&size=${size}`).then(r => r.data),
  getOne: (id) => api.get(`/api/receipts/${id}`).then(r => r.data),
  create: (data) => api.post('/api/receipts', data).then(r => r.data),
  delete: (id) => api.delete(`/api/receipts/${id}`),
}
