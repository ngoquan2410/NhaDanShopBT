import api from '../lib/axios'

export const comboService = {
  getAll: () => api.get('/api/combos').then(r => r.data),
  getActive: () => api.get('/api/combos/active').then(r => r.data),
  getOne: (id) => api.get(`/api/combos/${id}`).then(r => r.data),
  create: (data) => api.post('/api/combos', data).then(r => r.data),
  update: (id, data) => api.put(`/api/combos/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/api/combos/${id}`),
  toggle: (id) => api.patch(`/api/combos/${id}/toggle`).then(r => r.data),

  /** Tải template Excel import combo */
  downloadTemplate: async () => {
    const res = await api.get('/api/combos/template', { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href    = url
    a.download = 'template_import_combo.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  },

  /** Import combo từ file Excel */
  importExcel: async (file) => {
    const form = new FormData()
    form.append('file', file)
    const res = await api.post('/api/combos/import-excel', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return res.data
  },
}
