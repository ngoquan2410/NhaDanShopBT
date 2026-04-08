import api from '../lib/axios'

export const supplierService = {
  getAll: (q) => api.get('/api/suppliers', { params: q ? { q } : {} }).then(r => r.data),
  getById: (id) => api.get(`/api/suppliers/${id}`).then(r => r.data),
  create: (data) => api.post('/api/suppliers', data).then(r => r.data),
  update: (id, data) => api.put(`/api/suppliers/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/suppliers/${id}`),
}
