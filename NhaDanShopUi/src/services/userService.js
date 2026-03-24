import api from '../lib/axios'

export const userService = {
  getAll: (page = 0, size = 20) =>
    api.get(`/api/admin/users?page=${page}&size=${size}`).then(r => r.data),
  getOne: (id) => api.get(`/api/admin/users/${id}`).then(r => r.data),
  create: (data) => api.post('/api/admin/users', data).then(r => r.data),
  update: (id, data) => api.put(`/api/admin/users/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/admin/users/${id}`),
}
