import api from '../lib/axios'

const BASE = '/api/revenue'

export const revenueService = {
  // ── Tổng doanh thu ────────────────────────────────────────────────
  getTotal: (from, to, period = 'daily') =>
    api.get(`${BASE}/total`, { params: { from, to, period } }).then(r => r.data),

  exportTotal: (from, to, period = 'daily') =>
    api.get(`${BASE}/total/export`, {
      params: { from, to, period },
      responseType: 'blob',
    }).then(r => r.data),

  // ── Theo sản phẩm ────────────────────────────────────────────────
  getByProduct: (from, to, period = 'daily') =>
    api.get(`${BASE}/by-product`, { params: { from, to, period } }).then(r => r.data),

  exportByProduct: (from, to, period = 'daily') =>
    api.get(`${BASE}/by-product/export`, {
      params: { from, to, period },
      responseType: 'blob',
    }).then(r => r.data),

  // ── Theo danh mục ────────────────────────────────────────────────
  getByCategory: (from, to, period = 'daily') =>
    api.get(`${BASE}/by-category`, { params: { from, to, period } }).then(r => r.data),

  exportByCategory: (from, to, period = 'daily') =>
    api.get(`${BASE}/by-category/export`, {
      params: { from, to, period },
      responseType: 'blob',
    }).then(r => r.data),

  // ── Sprint 2: Top/Slow products ──────────────────────────────────
  getTopProducts: (from, to, limit = 10) =>
    api.get(`${BASE}/top-products`, { params: { from, to, limit } }).then(r => r.data),

  getSlowProducts: (days = 30) =>
    api.get(`${BASE}/slow-products`, { params: { days } }).then(r => r.data),
}

/** Trigger download blob từ API */
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
