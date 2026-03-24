import api from '../lib/axios'

export const ORDER_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
}

export const pendingOrderService = {
  // Khách tạo đơn chờ (chưa tạo invoice, chưa trừ kho)
  create: (data) => api.post('/api/pending-orders', data).then(r => r.data),

  // Admin lấy danh sách đơn chờ
  getAll: () => api.get('/api/pending-orders').then(r => r.data),

  // Polling: khách kiểm tra trạng thái đơn của mình
  getById: (id) => api.get(`/api/pending-orders/${id}`).then(r => r.data),

  // Admin xác nhận đã nhận tiền → BE tạo invoice + trừ kho
  confirm: (id) => api.post(`/api/pending-orders/${id}/confirm`).then(r => r.data),

  // Admin / hệ thống hủy đơn (quá hạn hoặc không nhận được tiền)
  cancel: (id, reason) =>
    api.post(`/api/pending-orders/${id}/cancel`, { reason }).then(r => r.data),
}
