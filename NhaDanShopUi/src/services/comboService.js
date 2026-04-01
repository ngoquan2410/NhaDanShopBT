import api from '../lib/axios'

export const comboService = {
  getAll: () => api.get('/api/combos').then(r => r.data),
  getActive: () => api.get('/api/combos/active').then(r => r.data),
  getOne: (id) => api.get(`/api/combos/${id}`).then(r => r.data),
  create: (data) => api.post('/api/combos', data).then(r => r.data),
  update: (id, data) => api.put(`/api/combos/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/combos/${id}`),
  toggle: (id) => api.patch(`/api/combos/${id}/toggle`).then(r => r.data),
}
