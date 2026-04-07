﻿﻿import { useState, useEffect, useRef } from 'react'
import { useProducts, useProductMutations, useVariants, useVariantMutations } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { productService } from '../../services/productService'
import { useSort } from '../../hooks/useSort'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-lg text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Image Uploader Component (Cloudflare R2 + base64 fallback) ───────────────
function ImageUploader({ imageUrl, onUrlChange }) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [r2Status, setR2Status] = useState(null)
  const [manualUrl, setManualUrl] = useState('')
  const [preview, setPreview] = useState(imageUrl || '')
  const fileInputRef = useRef(null)
  useEffect(() => {
    productService.getDriveStatus()
      .then(d => setR2Status(d))
      .catch(() => setR2Status({ configured: false, message: 'Không kết nối được server' }))
  }, [])
  useEffect(() => { setPreview(imageUrl || '') }, [imageUrl])
  const handleFile = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Chỉ chấp nhận file ảnh!'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Ảnh tối đa 10MB!'); return }
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    if (r2Status?.configured) {
      const id = toast.loading('Đang upload lên Cloudflare R2...')
      try {
        const result = await productService.uploadImage(file)
        onUrlChange(result.url); setPreview(result.url)
        toast.success('Upload R2 thành công!', { id })
      } catch (e) {
        toast.error(e?.response?.data?.detail || 'Lỗi upload R2', { id })
        setPreview(imageUrl || '')
      } finally { setUploading(false) }
    } else {
      const id = toast.loading('Đang xử lý ảnh...')
      try {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
        })
        onUrlChange(base64); setPreview(base64)
        toast.success('Đã lưu ảnh (base64)', { id })
      } catch { toast.error('Lỗi xử lý ảnh', { id }); setPreview(imageUrl || '') }
      finally { setUploading(false) }
    }
  }
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }
  const handleManualUrl = () => { const u = manualUrl.trim(); if (!u) return; setPreview(u); onUrlChange(u); toast.success('Đã cập nhật URL ảnh') }
  const handleRemove = () => { if (imageUrl?.startsWith('http') && r2Status?.configured) productService.deleteImage(imageUrl).catch(() => {}); onUrlChange(''); setPreview(''); setManualUrl(''); if (fileInputRef.current) fileInputRef.current.value = '' }
  const isBase64 = preview?.startsWith('data:')
  const isR2 = preview?.includes('.r2.dev')
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Hình ảnh sản phẩm</label>
        {r2Status === null ? <span className="text-xs text-gray-400 animate-pulse">Đang kiểm tra R2...</span>
          : r2Status.configured
            ? <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Cloudflare R2 sẵn sàng</span>
            : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Lưu base64 (R2 chưa cấu hình)</span>}
      </div>
      {preview && (
        <div className="relative inline-block">
          <img src={preview} alt="preview" className="w-32 h-32 object-cover rounded-xl border-2 border-orange-200 shadow-md" onError={e => { e.target.style.display = 'none' }} />
          <button type="button" onClick={handleRemove} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow hover:bg-red-600">×</button>
          <div className="mt-1 text-xs px-2 py-0.5 rounded border inline-block text-orange-700 bg-orange-50 border-orange-200">
            {isR2 ? 'Cloudflare R2' : isBase64 ? 'Base64 (DB)' : 'URL ngoài'}
          </div>
        </div>
      )}
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all select-none ${dragging ? 'border-orange-500 bg-orange-50 scale-105' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        {uploading
          ? <div className="flex flex-col items-center gap-2 text-orange-700"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm">{r2Status?.configured ? 'Đang upload lên Cloudflare R2...' : 'Đang xử lý ảnh...'}</span></div>
          : <div className="flex flex-col items-center gap-2 text-gray-500"><span className="text-4xl">{r2Status?.configured ? '☁️' : '📁'}</span><p className="text-sm font-medium text-gray-700">Kéo thả ảnh vào đây hoặc click để chọn</p><p className="text-xs text-gray-400">JPG, PNG, WEBP – tối đa 10MB</p>{r2Status?.configured && <p className="text-xs text-orange-600 font-medium mt-1">Upload trực tiếp lên Cloudflare R2 – CDN toàn cầu</p>}</div>}
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Hoặc nhập URL ảnh trực tiếp:</label>
        <div className="flex gap-2">
          <input type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualUrl()}
            placeholder="https://pub-xxx.r2.dev/..., https://i.imgur.com/..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          {manualUrl && <button type="button" onClick={handleManualUrl} className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 whitespace-nowrap">Áp dụng</button>}
        </div>
      </div>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800 space-y-1">
        <p className="font-semibold">Cách thêm ảnh:</p>
        {r2Status?.configured
          ? <><p>Kéo thả / chọn file – upload lên Cloudflare R2 (CDN, nhanh, bền vững)</p><p>Nhập URL – dán link từ bất kỳ nguồn nào</p></>
          : <><p>Kéo thả / chọn file – lưu base64 trong DB</p><p>Nhập URL – upload lên imgur.com rồi dán link</p><p className="text-orange-600">Để dùng R2: cấu hình r2.* trong application.properties</p></>}
      </div>
    </div>
  )
}

function ProductForm({ initial, categories, onSubmit, loading }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    code: initial?.code || '',
    name: initial?.name || '',
    categoryId: initial?.categoryId ? String(initial.categoryId) : '',
    active: initial?.active ?? true,
    imageUrl: initial?.imageUrl || '',
    productType: initial?.productType || 'SINGLE',
  })
  const [codeSuggestion, setCodeSuggestion] = useState('')
  const [codeError, setCodeError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Variants ngay trong form tạo mới (chỉ SINGLE) ─────────────────────
  const emptyVariant = () => ({
    _key: Date.now() + Math.random(),
    variantCode: '', variantName: '', sellUnit: 'cái', importUnit: '',
    piecesPerUnit: 1, sellPrice: 0, costPrice: 0, stockQty: 0,
    minStockQty: 5, expiryDays: '', isDefault: false, conversionNote: '',
  })
  const [variants, setVariants] = useState([{ ...emptyVariant(), isDefault: true }])
  const setV = (idx, k, v) => setVariants(vs => vs.map((vv, i) => i === idx ? { ...vv, [k]: v } : vv))

  // Khi chọn loại sản phẩm
  // COMBO → clear variants (combo không có variant, tồn kho ảo từ thành phần)
  // SINGLE → giữ hoặc khởi tạo 1 variant mặc định
  const handleTypeChange = (type) => {
    set('productType', type)
    if (type === 'COMBO') {
      setVariants([]) // Combo không có variant
    } else {
      if (variants.length === 0) setVariants([{ ...emptyVariant(), isDefault: true }])
    }
  }

  // Khi đổi isDefault → chỉ 1 variant được là default
  const setDefault = (idx) => {
    setVariants(vs => vs.map((vv, i) => ({ ...vv, isDefault: i === idx })))
  }

  // Auto-fill variantCode từ product code nếu chỉ có 1 variant
  useEffect(() => {
    if (isEdit) return
    if (variants.length === 1 && form.code && !variants[0].variantCode) {
      setV(0, 'variantCode', form.code)
    }
  }, [form.code])

  // Auto-fill variantName từ product name nếu chỉ có 1 variant
  useEffect(() => {
    if (isEdit) return
    if (variants.length === 1 && form.name && !variants[0].variantName) {
      setV(0, 'variantName', form.name)
    }
  }, [form.name])

  useEffect(() => {
    if (isEdit || !form.categoryId) return
    productService.getNextCode(form.categoryId)
      .then(c => setCodeSuggestion(c))
      .catch(() => setCodeSuggestion(''))
  }, [form.categoryId])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.code || !form.code.trim()) { setCodeError('Mã sản phẩm không được để trống'); return }
    setCodeError('')

    // Validate variants — CHỈ khi SINGLE (COMBO không có variant)
    if (!isEdit && form.productType !== 'COMBO') {
      for (const v of variants) {
        if (!v.variantCode.trim()) { alert('Mã biến thể không được để trống'); return }
        if (!v.variantName.trim()) { alert('Tên biến thể không được để trống'); return }
        if (!v.sellUnit.trim()) { alert('Đơn vị bán lẻ không được để trống'); return }
        if (Number(v.sellPrice) < 0) { alert('Giá bán không được âm'); return }
      }
      // Đảm bảo có đúng 1 default
      const hasDefault = variants.some(v => v.isDefault)
      if (!hasDefault && variants.length > 0) setDefault(0)
    }

    const payload = {
      ...form,
      categoryId: Number(form.categoryId),
      // Gửi initialVariants khi tạo mới SINGLE — COMBO không gửi variant
      initialVariants: (!isEdit && form.productType !== 'COMBO')
        ? variants.map(v => ({
            variantCode: v.variantCode.trim().toUpperCase(),
            variantName: v.variantName.trim(),
            sellUnit: v.sellUnit.trim() || 'cái',
            importUnit: v.importUnit || null,
            piecesPerUnit: Number(v.piecesPerUnit) || 1,
            sellPrice: Number(v.sellPrice) || 0,
            costPrice: Number(v.costPrice) || 0,
            stockQty: Number(v.stockQty) || 0,
            minStockQty: Number(v.minStockQty) || 5,
            expiryDays: v.expiryDays ? Number(v.expiryDays) : null,
            isDefault: !!v.isDefault,
            imageUrl: null,
            conversionNote: v.conversionNote || null,
          }))
        : undefined,
    }
    onSubmit(payload)
  }

  const categorySelected = !!form.categoryId
  const isComboType = form.productType === 'COMBO'

  // Helper render input cho variant

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className={`rounded-lg p-4 border-2 ${categorySelected ? 'border-green-200 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {categorySelected ? 'Danh mục' : 'Bước 1: Chọn danh mục trước *'}
        </label>
        <select value={form.categoryId} onChange={e => { set('categoryId', e.target.value); set('code', '') }} required
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white">
          <option value="">-- Chọn danh mục --</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!categorySelected && <p className="text-xs text-yellow-700 mt-1">Vui lòng chọn danh mục trước</p>}
      </div>

      {categorySelected && (
        <div className="rounded-lg p-4 border-2 border-blue-200 bg-blue-50">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            {isEdit ? 'Mã sản phẩm' : 'Bước 2: Nhập mã sản phẩm *'}
          </label>
          <input type="text" value={form.code}
            onChange={e => { set('code', e.target.value.toUpperCase()); setCodeError('') }}
            placeholder={isEdit ? '' : (codeSuggestion ? `Gợi ý: ${codeSuggestion}` : 'VD: BT001, M001...')}
            className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 text-sm font-mono font-bold tracking-widest uppercase ${codeError ? 'border-red-400 focus:ring-red-400' : 'border-blue-300 focus:ring-blue-400'}`}
          />
          {codeError && <p className="text-xs text-red-600 mt-1">⚠️ {codeError}</p>}
          {!isEdit && codeSuggestion && !codeError && (
            <p className="text-xs text-blue-600 mt-1">
              💡 Gợi ý: <b>{codeSuggestion}</b>
              <button type="button" onClick={() => set('code', codeSuggestion)} className="ml-2 underline hover:text-blue-800">Dùng gợi ý này</button>
            </p>
          )}
        </div>
      )}

      {categorySelected && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Loại sản phẩm - chỉ hiện khi tạo mới */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Loại sản phẩm *</label>
              <div className="flex gap-3">
                {[
                  { value: 'SINGLE', label: '📦 Sản phẩm đơn', desc: 'Có biến thể đóng gói (kg, hộp, bịch...)' },
                  { value: 'COMBO', label: '🎁 Combo', desc: 'Gói nhiều sản phẩm lại với nhau' },
                ].map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => handleTypeChange(opt.value)}
                    className={`flex-1 border-2 rounded-xl p-3 text-left transition-all ${form.productType === opt.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ImageUploader imageUrl={form.imageUrl} onUrlChange={url => set('imageUrl', url)} />

          {/* Variants - chỉ hiện khi SINGLE, không hiện cho COMBO */}
          {!isEdit && !isComboType && (
            <div className="border-2 rounded-xl p-4 space-y-3 border-purple-200 bg-purple-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-sm text-purple-800">🔀 Biến thể đóng gói</h4>
                  <p className="text-xs mt-0.5 text-purple-600">
                    Thiết lập ngay khi tạo sản phẩm – có thể thêm thêm sau
                  </p>
                </div>
                <button type="button"
                  onClick={() => setVariants(vs => [...vs, { ...emptyVariant(), isDefault: vs.length === 0 }])}
                  className="text-white px-3 py-1.5 rounded-lg text-xs bg-purple-600 hover:bg-purple-700">
                  + Thêm biến thể
                </button>
              </div>

              {variants.map((v, idx) => (
                <div key={v._key} className={`bg-white border rounded-xl p-3 space-y-2 ${v.isDefault ? 'border-purple-400' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-600">Biến thể #{idx + 1}{v.isDefault && <span className="ml-2 text-purple-600">(Mặc định)</span>}</span>
                    <div className="flex gap-2 items-center">
                      {!v.isDefault && (
                        <button type="button" onClick={() => setDefault(idx)}
                          className="text-xs text-purple-600 hover:underline">Đặt mặc định</button>
                      )}
                      {variants.length > 1 && (
                        <button type="button" onClick={() => setVariants(vs => vs.filter((_, i) => i !== idx))}
                          className="text-xs text-red-500 hover:text-red-700">✕ Xóa</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Mã biến thể *</label>
                      <input type="text" value={v.variantCode}
                        onChange={e => setV(idx, 'variantCode', e.target.value.toUpperCase())}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tên biến thể *</label>
                      <input type="text" value={v.variantName}
                        onChange={e => setV(idx, 'variantName', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Đơn vị bán lẻ *</label>
                      <input type="text" value={v.sellUnit} placeholder="cái, bịch, hộp..."
                        onChange={e => setV(idx, 'sellUnit', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Đơn vị nhập kho</label>
                      <input type="text" value={v.importUnit} placeholder="kg, thùng..."
                        onChange={e => setV(idx, 'importUnit', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Số lẻ / ĐV nhập</label>
                      <input type="number" value={v.piecesPerUnit} min={1}
                        onChange={e => setV(idx, 'piecesPerUnit', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Giá bán (₫) *</label>
                      <input type="number" value={v.sellPrice} min={0}
                        onChange={e => setV(idx, 'sellPrice', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Giá vốn (₫)</label>
                      <input type="number" value={v.costPrice} min={0}
                        onChange={e => setV(idx, 'costPrice', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tồn kho ban đầu</label>
                      <input type="number" value={v.stockQty} min={0}
                        onChange={e => setV(idx, 'stockQty', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ngưỡng cảnh báo tồn</label>
                      <input type="number" value={v.minStockQty} min={0}
                        onChange={e => setV(idx, 'minStockQty', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Số ngày HSD</label>
                      <input type="number" value={v.expiryDays} min={0} placeholder="để trống nếu không có"
                        onChange={e => setV(idx, 'expiryDays', e.target.value)}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ghi chú quy đổi</label>
                    <input type="text" value={v.conversionNote} placeholder="VD: 1 kg = 10 bịch 100g"
                      onChange={e => setV(idx, 'conversionNote', e.target.value)}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info box cho COMBO — thay thế section variant */}
          {!isEdit && isComboType && (
            <div className="border-2 border-green-200 bg-green-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <h4 className="font-semibold text-sm text-green-800">Tồn kho Combo — Tự động từ thành phần</h4>
              </div>
              <p className="text-xs text-green-700">
                Combo <b>không có variant</b> và <b>không nhập kho trực tiếp</b>.
                Tồn kho được tính tự động:
              </p>
              <div className="bg-white rounded-lg p-3 text-xs font-mono text-gray-700 border border-green-200">
                stockCombo = min( stock(SP_i) / qty_yêu_cầu(SP_i) ) — với mọi SP thành phần i
              </div>
              <p className="text-xs text-green-600">
                ✅ Sau khi tạo combo, vào <b>tab Quản lý Combo</b> để thêm các SP thành phần.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="pactive" checked={form.active} onChange={e => set('active', e.target.checked)} />
            <label htmlFor="pactive" className="text-sm text-gray-700">Hoạt động</label>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={loading || !form.code}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60">
              {loading ? 'Đang lưu...' : 'Lưu sản phẩm'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}

// ── Import Excel Modal ────────────────────────────────────────────────────────
function ImportExcelModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { toast.error('Chỉ hỗ trợ file .xlsx'); return }
    setFile(f); setResult(null)
  }

  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      await productService.downloadTemplate()
      toast.success('Đã tải template! Mở file và điền dữ liệu theo hướng dẫn.')
    } catch {
      toast.error('Lỗi tải template')
    } finally {
      setDownloading(false)
    }
  }

  const handleImport = async () => {
    if (!file) { toast.error('Chưa chọn file Excel'); return }
    setLoading(true)
    try {
      const res = await productService.importExcel(file)
      setResult(res)
      if (res.successCount > 0) {
        toast.success(`Import thành công ${res.successCount} sản phẩm!`)
        onSuccess()
      } else {
        toast.error('Không có sản phẩm nào được import')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Lỗi import Excel')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Banner download template */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 flex items-center justify-between">
        <div className="text-white">
          <p className="font-bold text-base">📥 Bước 1: Tải file template</p>
          <p className="text-blue-100 text-xs mt-0.5">File có sẵn dummy data + sheet hướng dẫn chi tiết từng cột</p>
        </div>
        <button onClick={handleDownloadTemplate} disabled={downloading}
          className="bg-white text-blue-700 font-bold px-5 py-2.5 rounded-lg hover:bg-blue-50 transition flex items-center gap-2 text-sm whitespace-nowrap disabled:opacity-70">
          {downloading
            ? <><span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />Đang tải...</>
            : <>⬇️ Tải Template Excel</>}
        </button>
      </div>

      {/* Cấu trúc nhanh */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-semibold mb-2">📋 Bước 2: Điền dữ liệu theo cấu trúc (từ dòng 4):</p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="bg-blue-100">
                {['A: Mã SP *', 'B: Tên SP *', 'C: Danh mục *', 'D: Đ/vị *', 'E: Giá vốn *', 'F: Giá bán *', 'G: Tồn kho', 'H: Hạn(ngày)', 'I: Hoạt động', 'J: ĐV nhập', 'K: ĐV bán', 'L: Số lẻ/ĐV', 'M: Ghi chú'].map(h => (
                  <th key={h} className="border border-blue-200 px-1.5 py-1 text-left whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                {['BT001', 'Bánh Tráng Rong Biển', 'Bánh Tráng', 'bịch', '6500', '9000', '100', '180', 'TRUE', 'kg', 'bịch', '10', '1kg=10 bịch'].map((v, i) => (
                  <td key={i} className="border border-blue-200 px-1.5 py-1 text-gray-600">{v}</td>
                ))}
              </tr>
              <tr className="bg-blue-50">
                {['', 'Muối Himalaya', 'Muối', 'gói', '5000', '8000', '0', '365', 'TRUE', 'gói', 'gói', '1', ''].map((v, i) => (
                  <td key={i} className="border border-blue-200 px-1.5 py-1 text-gray-500 italic">{v || '(tự tạo)'}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-blue-600">💡 Cột A (Mã SP) bắt buộc nhập — hệ thống không tự tạo mã. Danh mục chưa có → tự tạo. Mã trùng → bỏ qua (skip).</p>
      </div>

      {/* Upload area */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">📤 Bước 3: Upload file đã điền</p>
        <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragging ? 'border-green-500 bg-green-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-green-50'}`}>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
          {file ? (
            <div className="space-y-1">
              <div className="text-3xl">📄</div>
              <p className="font-medium text-green-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
              <button type="button" onClick={e => { e.stopPropagation(); setFile(null); setResult(null) }}
                className="text-xs text-red-500 hover:text-red-700 underline">Chọn file khác</button>
            </div>
          ) : (
            <div className="space-y-2 text-gray-500">
              <div className="text-4xl">📊</div>
              <p className="font-medium text-gray-700">Kéo thả file .xlsx vào đây hoặc click để chọn</p>
              <p className="text-xs text-gray-400">Chỉ hỗ trợ file Excel (.xlsx)</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Đóng</button>
        <button onClick={handleImport} disabled={!file || loading}
          className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-60 flex items-center gap-2">
          {loading ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang import...</> : '⬆️ Import Excel'}
        </button>
      </div>

      {/* Kết quả */}
      {result && (
        <div className={`rounded-xl border p-5 space-y-4 ${result.successCount > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h4 className="font-bold text-gray-800">📊 Kết quả Import</h4>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Tổng dòng', value: result.totalRows, color: 'blue' },
              { label: '✅ Thành công', value: result.successCount, color: 'green' },
              { label: '⏭️ Bỏ qua', value: result.skipCount, color: 'yellow' },
              { label: '❌ Lỗi', value: result.errorCount, color: 'red' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`bg-${color}-100 rounded-lg p-3 text-center`}>
                <div className={`text-2xl font-bold text-${color}-700`}>{value}</div>
                <div className={`text-xs text-${color}-600 mt-1`}>{label}</div>
              </div>
            ))}
          </div>
          {result.errors?.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-red-700 mb-2">Danh sách lỗi:</p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ── VariantManager: quản lý biến thể đóng gói của 1 SP ──────────────────────
function VariantManager({ product, onClose }) {
  const { data: variants = [], isLoading } = useVariants(product?.id)
  const { create, update, remove } = useVariantMutations(product?.id)
  const [form, setForm] = useState(null) // null=closed, {}=new, {id,...}=edit
  const empty = {
    variantCode: '', variantName: '', sellUnit: '', importUnit: '',
    piecesPerUnit: 1, sellPrice: 0, costPrice: 0, stockQty: 0, minStockQty: 5,
    expiryDays: '', isDefault: false, conversionNote: ''
  }

  const handleSave = async () => {
    const payload = {
      ...form,
      piecesPerUnit: Number(form.piecesPerUnit) || 1,
      sellPrice: Number(form.sellPrice) || 0,
      costPrice: Number(form.costPrice) || 0,
      stockQty: Number(form.stockQty) || 0,
      minStockQty: Number(form.minStockQty) || 5,
      expiryDays: form.expiryDays ? Number(form.expiryDays) : null,
    }
    if (form.id) await update.mutateAsync({ vid: form.id, data: payload })
    else await create.mutateAsync(payload)
    setForm(null)
  }

  const f = (label, key, type = 'text', extra = {}) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} value={form?.[key] ?? ''} min={extra.min}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-800">Biến thể của: <span className="text-green-700">{product?.name}</span></h4>
          <p className="text-xs text-gray-500 mt-0.5">Mỗi biến thể = 1 đơn vị giao dịch độc lập (mã riêng, giá riêng, tồn kho riêng)</p>
        </div>
        <button onClick={() => setForm({ ...empty, variantCode: product?.code })}
          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700">+ Thêm biến thể</button>
      </div>

      {/* Inline form */}
      {form && (
        <div className="border rounded-xl p-4 bg-green-50 space-y-3">
          <h5 className="font-medium text-green-800">{form.id ? 'Chỉnh sửa biến thể' : 'Thêm biến thể mới'}</h5>
          <div className="grid grid-cols-2 gap-3">
            {f('Mã biến thể *', 'variantCode')}
            {f('Tên biến thể *', 'variantName')}
            {f('Đơn vị bán lẻ *', 'sellUnit')}
            {f('Đơn vị nhập kho', 'importUnit')}
            {f('Số lẻ / ĐV nhập', 'piecesPerUnit', 'number', { min: 1 })}
            {f('Giá bán (₫)', 'sellPrice', 'number', { min: 0 })}
            {f('Giá vốn (₫)', 'costPrice', 'number', { min: 0 })}
            {f('Tồn kho', 'stockQty', 'number', { min: 0 })}
            {f('Ngưỡng cảnh báo tồn', 'minStockQty', 'number', { min: 0 })}
            {f('Số ngày HSD', 'expiryDays', 'number', { min: 0 })}
          </div>
          {f('Ghi chú quy đổi (VD: 1 kg = 10 hủ 100g)', 'conversionNote')}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="vd_default" checked={!!form.isDefault}
              onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))} />
            <label htmlFor="vd_default" className="text-sm text-gray-700">Đặt làm biến thể mặc định</label>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setForm(null)} className="px-4 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Hủy</button>
            <button onClick={handleSave} disabled={!form.variantCode || !form.variantName || !form.sellUnit || create.isLoading || update.isLoading}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-60">
              {create.isLoading || update.isLoading ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      )}

      {/* Danh sách variants */}
      {isLoading ? <p className="text-sm text-gray-400">Đang tải...</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border rounded-lg overflow-hidden" style={{ minWidth: 600 }}>
            <thead className="bg-gray-50">
              <tr className="text-gray-600">
                <th className="text-left px-3 py-2">Mã</th>
                <th className="text-left px-3 py-2">Tên</th>
                <th className="text-center px-3 py-2">ĐV bán</th>
                <th className="text-center px-3 py-2">ĐV nhập</th>
                <th className="text-center px-3 py-2">Pieces</th>
                <th className="text-right px-3 py-2">Giá bán</th>
                <th className="text-right px-3 py-2">Tồn kho</th>
                <th className="text-center px-3 py-2">Mặc định</th>
                <th className="text-center px-3 py-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {variants.length === 0
                ? <tr><td colSpan={9} className="text-center py-4 text-gray-400">Chưa có biến thể nào</td></tr>
                : variants.map(v => (
                  <tr key={v.id} className={`border-t hover:bg-gray-50 ${v.isDefault ? 'bg-green-50' : ''}`}>
                    <td className="px-3 py-2 font-mono font-bold text-green-700">{v.variantCode}</td>
                    <td className="px-3 py-2">{v.variantName}</td>
                    <td className="px-3 py-2 text-center">{v.sellUnit}</td>
                    <td className="px-3 py-2 text-center text-gray-400">{v.importUnit || '—'}</td>
                    <td className="px-3 py-2 text-center">{v.piecesPerUnit}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-medium">{Number(v.sellPrice).toLocaleString('vi-VN')} ₫</td>
                    <td className={`px-3 py-2 text-right font-medium ${v.lowStock ? 'text-red-600' : 'text-gray-800'}`}>
                      {v.stockQty} {v.sellUnit}
                      {v.lowStock && <span className="ml-1 text-red-500 text-xs">⚠️</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {v.isDefault ? <span className="text-green-600 font-bold">✓ Mặc định</span> : ''}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button onClick={() => setForm({ ...v })} className="text-blue-600 hover:text-blue-800 mr-2">Sửa</button>
                      <button onClick={() => { if (window.confirm('Xóa biến thể này?')) remove.mutate(v.id) }}
                        className="text-red-600 hover:text-red-800">Xóa</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Đóng</button>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const { create, update, remove } = useProductMutations()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showVariantModal, setShowVariantModal] = useState(null) // product object
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter ? String(p.categoryId) === catFilter : true
    return matchSearch && matchCat
  })
  const { sorted, SortHeader } = useSort(filtered, 'code')

  const handleSubmit = async (data) => {
    if (editing) await update.mutateAsync({ id: editing.id, data })
    else await create.mutateAsync(data)
    setShowModal(false); setEditing(null)
  }
  const handleEdit = (p) => { setEditing(p); setShowModal(true) }
  const handleDelete = (id) => { if (window.confirm('Xóa sản phẩm này?')) remove.mutate(id) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Quản lý Sản phẩm</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowImportModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
            📊 Import Excel
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true) }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
            + Thêm sản phẩm
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên, mã..."
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[200px]" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Tất cả danh mục</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <p className="text-sm text-gray-500">Hiển thị {sorted.length} / {products.length} sản phẩm</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="text-left px-3 py-3 w-12">Ảnh</th>
                <SortHeader field="code" className="text-left px-3 py-3 w-28">Mã SP</SortHeader>
                <SortHeader field="name" className="text-left px-3 py-3">Tên sản phẩm</SortHeader>
                <SortHeader field="categoryName" className="text-left px-3 py-3 w-32">Danh mục</SortHeader>
                <SortHeader field="costPrice" className="text-right px-3 py-3 w-28">Giá vốn</SortHeader>
                <SortHeader field="sellPrice" className="text-right px-3 py-3 w-28">Giá bán</SortHeader>
                <SortHeader field="stockQty" className="text-right px-3 py-3 w-24">Tồn kho</SortHeader>
                <SortHeader field="expiryDays" className="text-center px-3 py-3 w-24">Hạn (ngày)</SortHeader>
                <SortHeader field="active" className="text-center px-3 py-3 w-24">Trạng thái</SortHeader>
                <th className="text-center px-3 py-3 w-28">Biến thể</th>
                <th className="text-center px-3 py-3 w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? <tr><td colSpan={10} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
                : sorted.length === 0
                  ? <tr><td colSpan={10} className="text-center py-8 text-gray-400">Không có sản phẩm</td></tr>
                  : sorted.map(p => {
                    const dv = p.variants?.find(v => v.isDefault) || p.variants?.[0]
                    return (
                    <tr key={p.id} className="border-b hover:bg-gray-50 transition">
                      <td className="px-3 py-2">
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt={p.name} className="w-10 h-10 object-cover rounded-lg border" onError={e => { e.target.style.display = 'none' }} />
                          : <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-lg font-bold text-green-600">P</div>}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">{p.code}</td>
                      <td className="px-3 py-3 font-medium text-gray-800">{p.name}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{p.categoryName}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{dv ? Number(dv.costPrice).toLocaleString('vi-VN') + ' ₫' : '—'}</td>
                      <td className="px-3 py-3 text-right text-green-700 font-medium whitespace-nowrap">{dv ? Number(dv.sellPrice).toLocaleString('vi-VN') + ' ₫' : '—'}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className={dv && dv.stockQty <= 5 ? 'text-red-600 font-bold' : 'text-gray-800'}>
                          {dv ? `${dv.stockQty} ${dv.sellUnit || ''}` : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">{dv?.expiryDays || '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.active ? 'Đang bán' : 'Ẩn'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {p.productType === 'SINGLE' && (
                          <button onClick={() => setShowVariantModal(p)}
                            className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2 py-1 rounded-lg font-medium whitespace-nowrap">
                            🔀 {p.variants?.length > 0 ? `${p.variants.length} biến thể` : 'Thêm'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 mr-2 text-xs font-medium">Sửa</button>
                        <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Xóa</button>
                      </td>
                    </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editing ? 'Chỉnh sửa sản phẩm' : '➕ Thêm sản phẩm mới'} onClose={() => { setShowModal(false); setEditing(null) }}>
          <ProductForm initial={editing} categories={categories} onSubmit={handleSubmit} loading={create.isLoading || update.isLoading} />
        </Modal>
      )}
      {showImportModal && (
        <Modal title="📊 Import sản phẩm từ Excel" onClose={() => setShowImportModal(false)}>
          <ImportExcelModal
            onClose={() => setShowImportModal(false)}
            onSuccess={() => queryClient.invalidateQueries(['products'])}
          />
        </Modal>
      )}

      {/* Variant Manager Modal */}
      {showVariantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-lg text-gray-800">🔀 Quản lý Biến thể Đóng gói</h3>
              <button onClick={() => setShowVariantModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6">
              <VariantManager product={showVariantModal} onClose={() => setShowVariantModal(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
