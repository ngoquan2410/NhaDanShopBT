import api from '../lib/axios'

export const categoryService = {
  getAll: () => api.get('/api/categories').then(r => r.data),
  getOne: (id) => api.get(`/api/categories/${id}`).then(r => r.data),
  create: (data) => api.post('/api/categories', data).then(r => r.data),
  update: (id, data) => api.put(`/api/categories/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/categories/${id}`),
}
