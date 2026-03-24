import api from '../lib/axios'

export const reportService = {
  getProfitByRange: (from, to) =>
    api.get(`/api/reports/profit?from=${from}&to=${to}`).then(r => r.data),
  getProfitThisWeek: () =>
    api.get('/api/reports/profit/this-week').then(r => r.data),
  getProfitThisMonth: () =>
    api.get('/api/reports/profit/this-month').then(r => r.data),
  getProfitWeekly: (from, to) =>
    api.get(`/api/reports/profit/weekly?from=${from}&to=${to}`).then(r => r.data),
  getProfitMonthly: (from, to) =>
    api.get(`/api/reports/profit/monthly?from=${from}&to=${to}`).then(r => r.data),
  getInventoryReport: (from, to) =>
    api.get(`/api/reports/inventory?from=${from}&to=${to}`).then(r => r.data),

  // ── Excel exports ──────────────────────────────────────────────────────────
  exportProfitExcel: (from, to) =>
    api.get(`/api/reports/profit/export?from=${from}&to=${to}`, { responseType: 'blob' }).then(r => r.data),
  exportInventoryExcel: (from, to) =>
    api.get(`/api/reports/inventory/export?from=${from}&to=${to}`, { responseType: 'blob' }).then(r => r.data),
}

// Helper: trigger browser file download from a Blob
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
