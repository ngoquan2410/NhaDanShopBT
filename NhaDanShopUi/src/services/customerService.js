import api from '../lib/axios'

export const customerService = {
  getAll: (q) => api.get('/api/customers', { params: q ? { q } : {} }).then(r => r.data),
  getById: (id) => api.get(`/api/customers/${id}`).then(r => r.data),
  create: (data) => api.post('/api/customers', data).then(r => r.data),
  update: (id, data) => api.put(`/api/customers/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/customers/${id}`),
}
