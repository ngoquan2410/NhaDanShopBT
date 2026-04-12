﻿import { useState, useEffect, useRef } from 'react'
import { useProducts, useProductMutations, useVariants, useVariantMutations } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { productService } from '../../services/productService'
import { useSort } from '../../hooks/useSort'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AdminTable, AdminPageHeader, AdminCard } from '../../components/admin/AdminTable'

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
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Hình ảnh sản phẩm</label>
      {preview && (
        <div className="relative inline-block">
          <img src={preview} alt="preview" className="w-28 h-28 object-cover rounded-xl border-2 border-orange-200 shadow-md" onError={e => { e.target.style.display = 'none' }} />
          <button type="button" onClick={handleRemove} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow hover:bg-red-600">×</button>
        </div>
      )}
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all select-none ${dragging ? 'border-orange-500 bg-orange-50 scale-105' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        {uploading
          ? <div className="flex flex-col items-center gap-2 text-orange-700"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Đang tải ảnh...</span></div>
          : <div className="flex flex-col items-center gap-1 text-gray-400"><span className="text-3xl">🖼️</span><p className="text-sm text-gray-600">Kéo thả hoặc click để chọn ảnh</p><p className="text-xs">JPG, PNG, WEBP – tối đa 10MB</p></div>}
      </div>
      <div className="flex gap-2">
        <input type="url" value={manualUrl} onChange={e => setManualUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualUrl()}
          placeholder="Hoặc dán URL ảnh trực tiếp..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        {manualUrl && <button type="button" onClick={handleManualUrl} className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 whitespace-nowrap">Dùng URL</button>}
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
        if (Number(v.costPrice) < 0) { alert('Giá vốn không được âm'); return }
        // Giá bán = 0 → vẫn cho phép, cảnh báo sau khi nhập hàng
      }
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
                  <div className="grid grid-cols-2 gap-2 items-start">
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
                      <input type="text" inputMode="numeric" value={v.piecesPerUnit}
                        onChange={e => { const v2 = e.target.value.replace(/\D/g,''); setV(idx, 'piecesPerUnit', v2||1) }}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    {/* Giá bán + Giá vốn: wrap trong div có min-h để warning không đẩy lệch */}
                    <div className="col-span-2 grid grid-cols-2 gap-2 items-start">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Giá bán (₫)
                          <span className="ml-1 text-gray-400 font-normal">(để trống = điền sau)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={v.sellPrice === 0 || v.sellPrice === '' ? '' : Number(v.sellPrice).toLocaleString('vi-VN')}
                          placeholder="0"
                          onChange={e => {
                            const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                            if (raw === '' || /^\d+$/.test(raw)) setV(idx, 'sellPrice', raw === '' ? 0 : Number(raw))
                          }}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                        <div className="min-h-[1.25rem]">
                          {Number(v.sellPrice) > 0 && Number(v.sellPrice) % 1000 !== 0 && (
                            <p className="text-xs text-amber-600 mt-0.5">⚠️ Giá nên là bội số của 1.000₫</p>
                          )}
                          {Number(v.sellPrice) === 0 && (
                            <p className="text-xs text-amber-600 mt-0.5">⚠️ Chưa có giá bán — SP sẽ hiện 0₫ trên POS</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Giá vốn (₫)
                          <span className="ml-1 text-gray-400 font-normal">(để trống = tự tính khi nhập kho)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={v.costPrice === 0 || v.costPrice === '' ? '' : Number(v.costPrice).toLocaleString('vi-VN')}
                          placeholder="0"
                          onChange={e => {
                            const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                            if (raw === '' || /^\d+$/.test(raw)) setV(idx, 'costPrice', raw === '' ? 0 : Number(raw))
                          }}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                        <div className="min-h-[1.25rem]" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tồn kho ban đầu</label>
                      <input type="text" inputMode="numeric" value={v.stockQty}
                        onChange={e => { const r = e.target.value.replace(/\D/g,''); setV(idx, 'stockQty', r===''?0:Number(r)) }}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ngưỡng cảnh báo tồn</label>
                      <input type="text" inputMode="numeric" value={v.minStockQty}
                        onChange={e => { const r = e.target.value.replace(/\D/g,''); setV(idx, 'minStockQty', r===''?0:Number(r)) }}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Số ngày HSD</label>
                      <input type="text" inputMode="numeric" value={v.expiryDays||''} placeholder="Không có"
                        onChange={e => { const r = e.target.value.replace(/\D/g,''); setV(idx, 'expiryDays', r===''?0:Number(r)) }}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Ghi chú quy đổi</label>
                    <input type="text" value={v.conversionNote} placeholder="VD: 1 kg = 10 bịch"
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

// ── Import Excel Modal (có Preview giống phiếu nhập kho) ────────────────────
const fmt = n => Number(n ?? 0).toLocaleString('vi-VN')

function StatusBadge({ status }) {
  const map = {
    OK:              { bg: 'bg-green-100',  text: 'text-green-700',  label: '✅ Hợp lệ' },
    NEW_CATEGORY:    { bg: 'bg-blue-100',   text: 'text-blue-700',   label: '🆕 DM mới' },
    SKIP_DUPLICATE:  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '⏭️ Bỏ qua' },
    ERROR:           { bg: 'bg-red-100',    text: 'text-red-700',    label: '❌ Lỗi' },
  }
  const s = map[status] || map.ERROR
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function ImportExcelModal({ onClose, onSuccess }) {
  // ── State: 3 bước ──────────────────────────────────────────────────────────
  // step: 'upload' | 'preview' | 'done'
  const [step, setStep]         = useState('upload')
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting]   = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview]   = useState(null)   // ProductExcelPreviewResponse
  const [result, setResult]     = useState(null)   // ExcelImportResult
  const [filterStatus, setFilterStatus] = useState('ALL')
  const fileRef = useRef(null)

  // ── File pick ──────────────────────────────────────────────────────────────
  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { toast.error('Chỉ hỗ trợ file .xlsx'); return }
    setFile(f); setPreview(null); setResult(null); setStep('upload')
  }

  // ── Bước 1→2: Preview (Pass 1) ────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) { toast.error('Chưa chọn file Excel'); return }
    setPreviewing(true)
    try {
      const data = await productService.previewExcel(file)
      setPreview(data)
      setStep('preview')
      if (data.errorRows > 0)
        toast.error(`Có ${data.errorRows} dòng lỗi — vui lòng sửa file rồi upload lại`)
      else
        toast.success(`✅ ${data.validRows} dòng hợp lệ — có thể import`)
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.response?.data?.detail || 'Lỗi đọc file Excel')
    } finally { setPreviewing(false) }
  }

  // ── Bước 2→3: Import thật (Pass 2) ────────────────────────────────────────
  const handleImport = async () => {
    if (!file || !preview?.canImport) return
    setImporting(true)
    try {
      const res = await productService.importExcel(file)
      setResult(res); setStep('done')
      if (res.successCount > 0) {
        toast.success(`🎉 Import thành công ${res.successCount} sản phẩm!`)
        onSuccess()
      } else {
        toast.error('Không có sản phẩm nào được import')
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Lỗi import Excel')
    } finally { setImporting(false) }
  }

  // ── Download template ──────────────────────────────────────────────────────
  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      await productService.downloadTemplate()
      toast.success('Đã tải template!')
    } catch { toast.error('Lỗi tải template') }
    finally { setDownloading(false) }
  }

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filteredRows = preview?.rows?.filter(r =>
    filterStatus === 'ALL' ? true : r.status === filterStatus
  ) ?? []

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Stepper ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {[
          { id: 'upload',  label: '① Upload file' },
          { id: 'preview', label: '② Preview & Validate' },
          { id: 'done',    label: '③ Kết quả' },
        ].map((s, i, arr) => (
          <div key={s.id} className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full border transition ${
              step === s.id
                ? 'bg-blue-600 text-white border-blue-600'
                : step === 'done' || (step === 'preview' && s.id === 'upload') || (step === 'done' && s.id !== 'done')
                  ? 'bg-green-100 text-green-700 border-green-300'
                  : 'bg-gray-100 text-gray-400 border-gray-200'
            }`}>{s.label}</span>
            {i < arr.length - 1 && <span className="text-gray-300">›</span>}
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
           BƯỚC 1: UPLOAD
      ════════════════════════════════════════════════════════════════════ */}
      {(step === 'upload' || !preview) && (
        <>
          {/* Download template */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 flex items-center justify-between">
            <div className="text-white">
              <p className="font-bold text-sm">📥 Tải file template</p>
              <p className="text-blue-100 text-xs mt-0.5">13 cột A-M · J=ĐV bán lẻ bắt buộc · dummy data + hướng dẫn</p>
            </div>
            <button onClick={handleDownloadTemplate} disabled={downloading}
              className="bg-white text-blue-700 font-bold px-4 py-2 rounded-lg hover:bg-blue-50 text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-70">
              {downloading
                ? <><span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>Đang tải...</>
                : '⬇️ Tải Template'}
            </button>
          </div>

          {/* Cấu trúc cột */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-800 mb-2">📋 Cấu trúc 13 cột A-M (header dòng 3, data từ dòng 4):</p>
            <div className="flex flex-wrap gap-1">
              {[
                { col:'A', label:'Mã SP',           req:false, tip:'Để trống → tự sinh mã' },
                { col:'B', label:'Tên SP',           req:true },
                { col:'C', label:'Danh mục',         req:true,  tip:'Chưa có → tự tạo' },
                { col:'D', label:'Giá vốn',          req:true },
                { col:'E', label:'Giá bán',          req:true },
                { col:'F', label:'Tồn kho',          req:false },
                { col:'G', label:'Hạn (ngày)',       req:false },
                { col:'H', label:'Active',           req:false, tip:'TRUE/FALSE' },
                { col:'I', label:'ĐV nhập',          req:false },
                { col:'J', label:'ĐV bán lẻ',        req:true },
                { col:'K', label:'Số lẻ/ĐV',         req:false },
                { col:'L', label:'Ghi chú',          req:false },
                { col:'M', label:'Tồn tối thiểu',    req:false },
              ].map(({ col, label, req, tip }) => (
                <div key={col} title={tip || ''}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${
                    req ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                  }`}>
                  <span className="font-mono font-bold">{col}</span>
                  <span>{label}</span>
                  {req && <span className="text-red-500">*</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Upload area */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragging ? 'border-blue-500 bg-blue-50'
              : file    ? 'border-green-400 bg-green-50'
              :           'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
            }`}>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
              onChange={e => handleFile(e.target.files?.[0])} />
            {file ? (
              <div className="space-y-1">
                <div className="text-3xl">📄</div>
                <p className="font-semibold text-green-700">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                <button type="button" onClick={e => { e.stopPropagation(); setFile(null) }}
                  className="text-xs text-red-500 hover:text-red-700 underline">Chọn file khác</button>
              </div>
            ) : (
              <div className="space-y-2 text-gray-500">
                <div className="text-4xl">📊</div>
                <p className="font-medium text-gray-700">Kéo thả file .xlsx hoặc click để chọn</p>
                <p className="text-xs text-gray-400">Chỉ hỗ trợ .xlsx</p>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Đóng</button>
            <button onClick={handlePreview} disabled={!file || previewing}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
              {previewing
                ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Đang kiểm tra...</>
                : '🔍 Kiểm tra & Preview'}
            </button>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
           BƯỚC 2: PREVIEW
      ════════════════════════════════════════════════════════════════════ */}
      {step === 'preview' && preview && (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Tổng dòng',      value: preview.totalRows,  color: 'blue'   },
              { label: '✅ Hợp lệ',      value: preview.validRows,  color: 'green'  },
              { label: '⏭️ Bỏ qua',     value: preview.skipRows,   color: 'yellow' },
              { label: '❌ Lỗi',         value: preview.errorRows,  color: 'red'    },
            ].map(({ label, value, color }) => (
              <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-3 text-center`}>
                <div className={`text-2xl font-bold text-${color}-700`}>{value}</div>
                <div className={`text-xs text-${color}-600 mt-0.5 font-medium`}>{label}</div>
              </div>
            ))}
          </div>

          {/* Verdict */}
          {preview.canImport ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-300 rounded-xl px-4 py-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-800">Sẵn sàng import {preview.validRows} sản phẩm</p>
                {preview.skipRows > 0 && (
                  <p className="text-xs text-green-600">{preview.skipRows} dòng trùng tên/mã sẽ được bỏ qua</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
              <span className="text-2xl">❌</span>
              <div>
                <p className="font-semibold text-red-800">Có {preview.errorRows} lỗi — không thể import</p>
                <p className="text-xs text-red-600">Vui lòng sửa file Excel rồi upload lại</p>
              </div>
            </div>
          )}

          {/* Warnings */}
          {preview.warnings?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-yellow-800 mb-1">⚠️ Cảnh báo ({preview.warnings.length}):</p>
              <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-yellow-700">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'ALL',             label: `Tất cả (${preview.totalRows})` },
              { id: 'OK',              label: `✅ Hợp lệ (${preview.rows?.filter(r=>r.status==='OK').length??0})` },
              { id: 'NEW_CATEGORY',    label: `🆕 DM mới (${preview.rows?.filter(r=>r.status==='NEW_CATEGORY').length??0})` },
              { id: 'SKIP_DUPLICATE',  label: `⏭️ Bỏ qua (${preview.skipRows})` },
              { id: 'ERROR',           label: `❌ Lỗi (${preview.errorRows})` },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  filterStatus === f.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>{f.label}</button>
            ))}
          </div>

          {/* Preview table */}
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-xs" style={{ minWidth: 900 }}>
                <thead className="sticky top-0 bg-gray-50 border-b">
                  <tr className="text-gray-600">
                    <th className="px-3 py-2 text-center w-10">#</th>
                    <th className="px-3 py-2 text-center w-28">Trạng thái</th>
                    <th className="px-3 py-2 text-left w-24">Mã SP</th>
                    <th className="px-3 py-2 text-left min-w-[160px]">Tên SP</th>
                    <th className="px-3 py-2 text-left w-28">Danh mục</th>
                    <th className="px-3 py-2 text-right w-24">Giá vốn</th>
                    <th className="px-3 py-2 text-right w-24">Giá bán</th>
                    <th className="px-3 py-2 text-right w-16">Tồn</th>
                    <th className="px-3 py-2 text-left w-16">ĐV bán(J)</th>
                    <th className="px-3 py-2 text-left w-20">ĐV nhập(I)</th>
                    <th className="px-3 py-2 text-left min-w-[140px]">Lỗi / Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-8 text-gray-400">Không có dòng nào</td></tr>
                  ) : filteredRows.map((row, i) => (
                    <tr key={i} className={`${
                      row.status === 'ERROR'          ? 'bg-red-50'
                      : row.status === 'SKIP_DUPLICATE' ? 'bg-yellow-50 opacity-75'
                      : row.status === 'NEW_CATEGORY' ? 'bg-blue-50'
                      : 'bg-white hover:bg-gray-50'
                    }`}>
                      <td className="px-3 py-2 text-center text-gray-400">{row.lineNumber}</td>
                      <td className="px-3 py-2 text-center"><StatusBadge status={row.status} /></td>
                      <td className="px-3 py-2 font-mono">
                        <span className="text-gray-700">{row.code || ''}</span>
                        {row.isAutoCode && <span className="ml-1 text-gray-400 italic text-xs">(tự sinh)</span>}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {row.categoryName || '—'}
                        {row.isNewCategory && <span className="ml-1 text-blue-500 text-xs">(mới)</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {row.costPrice != null ? fmt(row.costPrice) + ' ₫' : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">
                        {row.sellPrice != null ? fmt(row.sellPrice) + ' ₫' : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{row.stockQty ?? 0}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{row.sellUnit || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {row.importUnit
                          ? <span title={row.conversionNote || ''}>
                              {row.importUnit}{row.piecesPerUnit > 1 ? `→${row.piecesPerUnit}${row.sellUnit||''}` : ''}
                            </span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.errorMessage && <span className="text-red-600 font-medium">⚠ {row.errorMessage}</span>}
                        {!row.errorMessage && row.warningMessage && <span className="text-yellow-600">⚡ {row.warningMessage}</span>}
                        {!row.errorMessage && !row.warningMessage && row.status === 'SKIP_DUPLICATE' && (
                          <span className="text-yellow-600">Trùng tên/danh mục → bỏ qua</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-1">
            <button onClick={() => { setStep('upload'); setPreview(null) }}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">← Chọn file khác</button>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Đóng</button>
              <button onClick={handleImport} disabled={!preview.canImport || importing}
                className={`px-6 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                  preview.canImport ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                } disabled:opacity-60`}>
                {importing
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Đang import...</>
                  : preview.canImport
                    ? `🚀 Xác nhận import ${preview.validRows} sản phẩm`
                    : `❌ Không thể import (có lỗi)`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
           BƯỚC 3: KẾT QUẢ
      ════════════════════════════════════════════════════════════════════ */}
      {step === 'done' && result && (
        <>
          <div className={`rounded-xl border p-5 space-y-4 ${
            result.successCount > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{result.successCount > 0 ? '🎉' : '😞'}</span>
              <div>
                <h4 className="font-bold text-gray-800 text-base">
                  {result.successCount > 0 ? `Import thành công ${result.successCount} sản phẩm!` : 'Không có sản phẩm nào được import'}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tổng {result.totalRows} dòng · {result.successCount} thành công · {result.skipCount} bỏ qua · {result.errorCount} lỗi
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Tổng dòng',    value: result.totalRows,    color: 'blue'   },
                { label: '✅ Thành công', value: result.successCount, color: 'green'  },
                { label: '⏭️ Bỏ qua',   value: result.skipCount,    color: 'yellow' },
                { label: '❌ Lỗi',       value: result.errorCount,   color: 'red'    },
              ].map(({ label, value, color }) => (
                <div key={label} className={`bg-${color}-100 rounded-lg p-3 text-center`}>
                  <div className={`text-2xl font-bold text-${color}-700`}>{value}</div>
                  <div className={`text-xs text-${color}-600 mt-1`}>{label}</div>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-700 mb-2">Chi tiết lỗi:</p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-600 flex gap-1"><span>•</span><span>{e}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            {result.successCount === 0 && (
              <button onClick={() => { setStep('upload'); setPreview(null); setResult(null) }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">← Thử lại</button>
            )}
            <button onClick={onClose}
              className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              {result.successCount > 0 ? '✅ Đóng' : 'Đóng'}
            </button>
          </div>
        </>
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số lẻ / ĐV nhập</label>
              <input type="text" inputMode="numeric" value={form?.piecesPerUnit||1}
                onChange={e => { const r=e.target.value.replace(/\D/g,''); setForm(p=>({...p,piecesPerUnit:r||1})) }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            {/* Giá bán */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Giá bán (₫)</label>
              <input type="text" inputMode="numeric"
                value={form?.sellPrice === 0 || form?.sellPrice === '' ? '' : Number(form?.sellPrice).toLocaleString('vi-VN')}
                placeholder="0"
                onChange={e => {
                  const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                  if (raw === '' || /^\d+$/.test(raw)) setForm(p => ({ ...p, sellPrice: raw === '' ? 0 : Number(raw) }))
                }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              {Number(form?.sellPrice) > 0 && Number(form?.sellPrice) % 1000 !== 0 && (
                <p className="text-xs text-amber-600 mt-0.5">⚠️ Nên là bội số 1.000₫</p>
              )}
              {Number(form?.sellPrice) === 0 && (
                <p className="text-xs text-amber-600 mt-0.5">⚠️ Chưa có giá — hiện 0₫ trên POS</p>
              )}
            </div>
            {/* Giá vốn */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Giá vốn (₫)</label>
              <input type="text" inputMode="numeric"
                value={form?.costPrice === 0 || form?.costPrice === '' ? '' : Number(form?.costPrice).toLocaleString('vi-VN')}
                placeholder="0"
                onChange={e => {
                  const raw = e.target.value.replace(/\./g, '').replace(/,/g, '')
                  if (raw === '' || /^\d+$/.test(raw)) setForm(p => ({ ...p, costPrice: raw === '' ? 0 : Number(raw) }))
                }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tồn kho</label>
              <input type="text" inputMode="numeric" value={form?.stockQty||0}
                onChange={e => { const r=e.target.value.replace(/\D/g,''); setForm(p=>({...p,stockQty:r===''?0:Number(r)})) }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ngưỡng cảnh báo tồn</label>
              <input type="text" inputMode="numeric" value={form?.minStockQty||5}
                onChange={e => { const r=e.target.value.replace(/\D/g,''); setForm(p=>({...p,minStockQty:r===''?0:Number(r)})) }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số ngày HSD</label>
              <input type="text" inputMode="numeric" value={form?.expiryDays||''} placeholder="Không có"
                onChange={e => { const r=e.target.value.replace(/\D/g,''); setForm(p=>({...p,expiryDays:r===''?null:Number(r)})) }}
                className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
          </div>
          {f('Ghi chú quy đổi', 'conversionNote')}
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
                <th className="text-center px-3 py-2">Số lẻ/ĐV</th>
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
    <div className="space-y-4">
      {/* ── Header ── */}
      <AdminPageHeader
        title="Quản lý Sản phẩm"
        actions={<>
          <button onClick={() => setShowImportModal(true)}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm font-medium">
            📊 Import Excel
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true) }}
            className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 flex items-center gap-1.5 text-sm font-medium">
            + Thêm sản phẩm
          </button>
        </>}
      />

      <AdminCard>
        {/* ── Filters ── */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, mã..."
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 sm:w-44">
            <option value="">Tất cả danh mục</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-500 mb-3">Hiển thị {sorted.length} / {products.length} sản phẩm</p>

        {/* ── Table (desktop) / Cards (mobile) ── */}
        <AdminTable
          loading={isLoading}
          rows={sorted}
          emptyText="Không có sản phẩm nào"
          columns={[
            { key: 'img', label: 'Ảnh', thClassName: 'w-12', render: p => (
              p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} className="w-10 h-10 object-cover rounded-lg border" onError={e => { e.target.style.display='none' }} />
                : <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-base font-bold text-green-600">P</div>
            )},
            { key: 'code', label: 'Mã SP', mobileLabel: 'Mã', thClassName: 'w-28', tdClassName: 'font-mono text-xs text-gray-500 whitespace-nowrap' },
            { key: 'name', label: 'Tên sản phẩm', mobileLabel: false, tdClassName: 'font-medium text-gray-800' },
            { key: 'categoryName', label: 'Danh mục', tdClassName: 'text-gray-500 text-xs', thClassName: 'w-28' },
            { key: 'sellPrice', label: 'Giá bán', thClassName: 'w-28 text-right', tdClassName: 'text-right text-green-700 font-medium whitespace-nowrap',
              render: p => { const dv = p.variants?.find(v=>v.isDefault)||p.variants?.[0]; return dv ? Number(dv.sellPrice).toLocaleString('vi-VN')+' ₫' : '—' }},
            { key: 'stockQty', label: 'Tồn kho', thClassName: 'w-24 text-right', tdClassName: 'text-right whitespace-nowrap',
              render: p => { const dv = p.variants?.find(v=>v.isDefault)||p.variants?.[0]; return dv ? <span className={dv.stockQty<=5?'text-red-600 font-bold':''}>{dv.stockQty} {dv.sellUnit}</span> : '—' }},
            { key: 'active', label: 'Trạng thái', thClassName: 'w-24 text-center', tdClassName: 'text-center',
              render: p => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{p.active?'Đang bán':'Ẩn'}</span>},
            { key: 'actions', label: 'Thao tác', isAction: true, thClassName: 'w-32 text-center', tdClassName: 'text-center whitespace-nowrap',
              render: p => (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {p.productType === 'SINGLE' && (
                    <button onClick={() => setShowVariantModal(p)}
                      className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2 py-1 rounded-lg font-medium">
                      🔀 {p.variants?.length > 0 ? p.variants.length : 'Thêm'}
                    </button>
                  )}
                  <button onClick={() => handleEdit(p)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Sửa</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Xóa</button>
                </div>
              )},
          ]}
          mobileCard={p => {
            const dv = p.variants?.find(v=>v.isDefault)||p.variants?.[0]
            return (
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="shrink-0">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} className="w-14 h-14 object-cover rounded-xl border" onError={e=>{e.target.style.display='none'}} />
                    : <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center text-xl font-bold text-green-600">P</div>}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{p.code}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${p.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                      {p.active?'Đang bán':'Ẩn'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{p.categoryName}</span>
                    {dv && <span className="text-sm font-bold text-green-700">{Number(dv.sellPrice).toLocaleString('vi-VN')} ₫</span>}
                    {dv && <span className={`text-xs font-medium ${dv.stockQty<=5?'text-red-600':'text-gray-600'}`}>Tồn: {dv.stockQty} {dv.sellUnit}</span>}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                    {p.productType === 'SINGLE' && (
                      <button onClick={() => setShowVariantModal(p)}
                        className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1">
                        🔀 {p.variants?.length > 0 ? `${p.variants.length} biến thể` : 'Biến thể'}
                      </button>
                    )}
                    <button onClick={() => handleEdit(p)}
                      className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-medium">
                      ✏️ Sửa
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1.5 rounded-lg font-medium">
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              </div>
            )
          }}
        />
      </AdminCard>

      {showModal && (
        <Modal title={editing ? 'Chỉnh sửa sản phẩm' : '➕ Thêm sản phẩm mới'} onClose={() => { setShowModal(false); setEditing(null) }}>
          <ProductForm initial={editing} categories={categories} onSubmit={handleSubmit} loading={create.isLoading || update.isLoading} />
        </Modal>
      )}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h3 className="font-bold text-lg text-gray-800">📊 Import sản phẩm từ Excel</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 sm:p-6">
              <ImportExcelModal onClose={() => setShowImportModal(false)} onSuccess={() => queryClient.invalidateQueries(['products'])} />
            </div>
          </div>
        </div>
      )}
      {showVariantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-lg text-gray-800">🔀 Quản lý Biến thể Đóng gói</h3>
              <button onClick={() => setShowVariantModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-4 sm:p-6">
              <VariantManager product={showVariantModal} onClose={() => setShowVariantModal(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
