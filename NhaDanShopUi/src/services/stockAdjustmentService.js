import api from '../lib/axios'

export const stockAdjustmentService = {
  getAll: (page = 0, size = 20) =>
    api.get('/api/stock-adjustments', { params: { page, size } }).then(r => r.data),
  getById: (id) => api.get(`/api/stock-adjustments/${id}`).then(r => r.data),
  create: (data) => api.post('/api/stock-adjustments', data).then(r => r.data),
  confirm: (id) => api.put(`/api/stock-adjustments/${id}/confirm`).then(r => r.data),
  delete: (id) => api.delete(`/api/stock-adjustments/${id}`),
}
