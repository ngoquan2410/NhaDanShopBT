import api from '../lib/axios'

export const promotionService = {
  getAll: (page = 0, size = 20) =>
    api.get(`/api/promotions?page=${page}&size=${size}`).then(r => r.data),

  getActive: () =>
    api.get('/api/promotions/active').then(r => r.data),

  getOne: (id) =>
    api.get(`/api/promotions/${id}`).then(r => r.data),

  create: (data) =>
    api.post('/api/promotions', data).then(r => r.data),

  update: (id, data) =>
    api.put(`/api/promotions/${id}`, data).then(r => r.data),

  toggle: (id) =>
    api.patch(`/api/promotions/${id}/toggle`).then(r => r.data),

  delete: (id) =>
    api.delete(`/api/promotions/${id}`),
}
