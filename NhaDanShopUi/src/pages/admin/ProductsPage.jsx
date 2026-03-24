import { useState, useEffect, useRef } from 'react'
import { useProducts, useProductMutations } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { productService } from '../../services/productService'
import { useSort } from '../../hooks/useSort'
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
      .catch(() => setR2Status({ configured: false, message: 'Khong ket noi duoc server' }))
  }, [])
  useEffect(() => { setPreview(imageUrl || '') }, [imageUrl])
  const handleFile = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Chi chap nhan file anh!'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Anh toi da 10MB!'); return }
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    if (r2Status?.configured) {
      const id = toast.loading('Dang upload len Cloudflare R2...')
      try {
        const result = await productService.uploadImage(file)
        onUrlChange(result.url); setPreview(result.url)
        toast.success('Upload R2 thanh cong!', { id })
      } catch (e) {
        toast.error(e?.response?.data?.detail || 'Loi upload R2', { id })
        setPreview(imageUrl || '')
      } finally { setUploading(false) }
    } else {
      const id = toast.loading('Dang xu ly anh...')
      try {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file)
        })
        onUrlChange(base64); setPreview(base64)
        toast.success('Da luu anh (base64)', { id })
      } catch { toast.error('Loi xu ly anh', { id }); setPreview(imageUrl || '') }
      finally { setUploading(false) }
    }
  }
  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }
  const handleManualUrl = () => { const u=manualUrl.trim(); if(!u)return; setPreview(u); onUrlChange(u); toast.success('Da cap nhat URL anh') }
  const handleRemove = () => { if(imageUrl?.startsWith('http')&&r2Status?.configured) productService.deleteImage(imageUrl).catch(()=>{}); onUrlChange(''); setPreview(''); setManualUrl(''); if(fileInputRef.current) fileInputRef.current.value='' }
  const isBase64 = preview?.startsWith('data:')
  const isR2 = preview?.includes('.r2.dev')
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Hinh anh san pham</label>
        {r2Status===null ? <span className="text-xs text-gray-400 animate-pulse">Dang kiem tra R2...</span>
          : r2Status.configured
            ? <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Cloudflare R2 san sang</span>
            : <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Luu base64 (R2 chua cau hinh)</span>}
      </div>
      {preview && (
        <div className="relative inline-block">
          <img src={preview} alt="preview" className="w-32 h-32 object-cover rounded-xl border-2 border-orange-200 shadow-md" onError={e=>{e.target.style.display='none'}}/>
          <button type="button" onClick={handleRemove} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow hover:bg-red-600">x</button>
          <div className="mt-1 text-xs px-2 py-0.5 rounded border inline-block text-orange-700 bg-orange-50 border-orange-200">
            {isR2 ? 'Cloudflare R2' : isBase64 ? 'Base64 (DB)' : 'URL ngoai'}
          </div>
        </div>
      )}
      <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
        onClick={()=>fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all select-none ${dragging?'border-orange-500 bg-orange-50 scale-105':'border-gray-300 hover:border-orange-400 hover:bg-orange-50'} ${uploading?'opacity-50 pointer-events-none':''}`}>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e=>handleFile(e.target.files?.[0])}/>
        {uploading
          ? <div className="flex flex-col items-center gap-2 text-orange-700"><div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/><span className="text-sm">{r2Status?.configured?'Dang upload len Cloudflare R2...':'Dang xu ly anh...'}</span></div>
          : <div className="flex flex-col items-center gap-2 text-gray-500"><span className="text-4xl">{r2Status?.configured?'cloud':'folder'}</span><p className="text-sm font-medium text-gray-700">Keo tha anh vao day hoac click de chon</p><p className="text-xs text-gray-400">JPG, PNG, WEBP - toi da 10MB</p>{r2Status?.configured&&<p className="text-xs text-orange-600 font-medium mt-1">Upload truc tiep len Cloudflare R2 - CDN toan cau</p>}</div>}
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Hoac nhap URL anh truc tiep:</label>
        <div className="flex gap-2">
          <input type="url" value={manualUrl} onChange={e=>setManualUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleManualUrl()}
            placeholder="https://pub-xxx.r2.dev/..., https://i.imgur.com/..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/>
          {manualUrl&&<button type="button" onClick={handleManualUrl} className="px-3 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 whitespace-nowrap">Ap dung</button>}
        </div>
      </div>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800 space-y-1">
        <p className="font-semibold">Cach them anh:</p>
        {r2Status?.configured
          ? <><p>Keo tha / chon file - upload len Cloudflare R2 (CDN, nhanh, ben vung)</p><p>Nhap URL - dan link tu bat ky nguon nao</p></>
          : <><p>Keo tha / chon file - luu base64 trong DB</p><p>Nhap URL - upload len imgur.com roi dan link</p><p className="text-orange-600">De dung R2: cau hinh r2.* trong application.properties</p></>}
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
    unit: initial?.unit || '',
    costPrice: initial?.costPrice || '',
    sellPrice: initial?.sellPrice || '',
    stockQty: initial?.stockQty ?? 0,
    active: initial?.active ?? true,
    expiryDays: initial?.expiryDays || 0,
    importUnit: initial?.importUnit || '',
    sellUnit: initial?.sellUnit || '',
    piecesPerImportUnit: initial?.piecesPerImportUnit || 1,
    conversionNote: initial?.conversionNote || '',
    imageUrl: initial?.imageUrl || '',
  })
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  useEffect(() => {
    if (isEdit || !form.categoryId) return
    setCodeLoading(true); setCodeError(null)
    productService.getNextCode(form.categoryId)
      .then(code => set('code', code))
      .catch(() => setCodeError('Khong the lay ma tu dong'))
      .finally(() => setCodeLoading(false))
  }, [form.categoryId])
  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ ...form, code: isEdit ? form.code : '', categoryId: Number(form.categoryId),
      costPrice: Number(form.costPrice), sellPrice: Number(form.sellPrice),
      stockQty: Number(form.stockQty), expiryDays: Number(form.expiryDays),
      piecesPerImportUnit: Number(form.piecesPerImportUnit) })
  }
  const field = (label, key, type='text', required=false, extra={}) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required&&' *'}</label>
      <input type={type} value={form[key]} onChange={e=>set(key,type==='checkbox'?e.target.checked:e.target.value)}
        required={required} {...extra} className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"/>
    </div>
  )
  const categorySelected = !!form.categoryId
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className={`rounded-lg p-4 border-2 ${categorySelected?'border-green-200 bg-green-50':'border-yellow-300 bg-yellow-50'}`}>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          {categorySelected ? 'Danh muc' : 'Buoc 1: Chon danh muc truoc *'}
        </label>
        <select value={form.categoryId} onChange={e=>{set('categoryId',e.target.value);set('code','')}} required
          className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white">
          <option value="">-- Chon danh muc --</option>
          {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!categorySelected&&<p className="text-xs text-yellow-700 mt-1">Vui long chon danh muc de tu dong tao ma san pham</p>}
      </div>
      {categorySelected && (
        <div className="rounded-lg p-4 border border-gray-200 bg-gray-50">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Ma san pham {isEdit?'':'(tu dong)'}</label>
          {isEdit ? (
            <input type="text" value={form.code} onChange={e=>set('code',e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm font-mono"/>
          ) : (
            <div className="flex items-center gap-3">
              <div className={`flex-1 border rounded-lg px-3 py-2 text-sm font-mono font-bold tracking-widest ${codeLoading?'text-gray-400 bg-gray-100 animate-pulse':'text-green-700 bg-white border-green-300'}`}>
                {codeLoading?'Dang tao ma...':(form.code||'--')}
              </div>
              {codeError&&<span className="text-red-500 text-xs">{codeError}</span>}
              <button type="button" onClick={()=>{setCodeLoading(true);productService.getNextCode(form.categoryId).then(c=>set('code',c)).catch(()=>setCodeError('Loi')).finally(()=>setCodeLoading(false))}}
                className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap">Lam moi</button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">{isEdit?'Chinh sua ma neu can':'Ma duoc tao tu dong theo danh muc'}</p>
        </div>
      )}
      {categorySelected && (
        <>
          <div className="grid grid-cols-2 gap-4">
            {field('Ten san pham','name','text',true)}
            {field('Don vi','unit','text',true)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('So ngay han su dung','expiryDays','number')}
            {field('Ton kho ban dau','stockQty','number')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Gia von (d)','costPrice','number',true)}
            {field('Gia ban (d)','sellPrice','number',true)}
          </div>
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-600 mb-3">Quy doi don vi (tuy chon)</p>
            <div className="grid grid-cols-2 gap-4">
              {field('Don vi nhap kho','importUnit')}
              {field('Don vi ban le','sellUnit')}
            </div>
            {field('So le / don vi nhap','piecesPerImportUnit','number')}
            {field('Ghi chu quy doi','conversionNote')}
          </div>
          <ImageUploader imageUrl={form.imageUrl} onUrlChange={url=>set('imageUrl',url)}/>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="pactive" checked={form.active} onChange={e=>set('active',e.target.checked)}/>
            <label htmlFor="pactive" className="text-sm text-gray-700">Hoat dong</label>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={loading||codeLoading||!form.code}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-60 flex items-center gap-2">
              {loading?'Dang luu...':'Luu san pham'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
export default function ProductsPage() {
  const { data: products = [], isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const { create, update, remove } = useProductMutations()
  const [showModal, setShowModal] = useState(false)
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
  const handleDelete = (id) => { if (window.confirm('Xoa san pham nay?')) remove.mutate(id) }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Quan ly San pham</h2>
        <button onClick={()=>{setEditing(null);setShowModal(true)}} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          + Them san pham
        </button>
      </div>
      <div className="bg-white rounded-xl shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tim theo ten, ma..."
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 min-w-[200px]"/>
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
            <option value="">Tat ca danh muc</option>
            {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <p className="text-sm text-gray-500">Hien thi {sorted.length} / {products.length} san pham</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 border-b">
                <th className="text-left px-3 py-3 w-14">Anh</th>
                <SortHeader field="code" className="text-left px-3 py-3">Ma SP</SortHeader>
                <SortHeader field="name" className="text-left px-3 py-3">Ten san pham</SortHeader>
                <SortHeader field="categoryName" className="text-left px-3 py-3">Danh muc</SortHeader>
                <SortHeader field="costPrice" className="text-right px-3 py-3">Gia von</SortHeader>
                <SortHeader field="sellPrice" className="text-right px-3 py-3">Gia ban</SortHeader>
                <SortHeader field="stockQty" className="text-right px-3 py-3">Ton kho</SortHeader>
                <SortHeader field="expiryDays" className="text-center px-3 py-3">Han (ngay)</SortHeader>
                <SortHeader field="active" className="text-center px-3 py-3">Trang thai</SortHeader>
                <th className="text-center px-3 py-3">Thao tac</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={10} className="text-center py-8 text-gray-400">Dang tai...</td></tr>
                : sorted.length===0 ? <tr><td colSpan={10} className="text-center py-8 text-gray-400">Khong co san pham</td></tr>
                : sorted.map(p=>(
                  <tr key={p.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-3 py-2">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} className="w-10 h-10 object-cover rounded-lg border" onError={e=>{e.target.style.display='none'}}/>
                        : <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-lg">P</div>}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{p.code}</td>
                    <td className="px-3 py-3 font-medium text-gray-800">{p.name}</td>
                    <td className="px-3 py-3 text-gray-500">{p.categoryName}</td>
                    <td className="px-3 py-3 text-right">{Number(p.costPrice).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-3 text-right text-green-700 font-medium">{Number(p.sellPrice).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-3 text-right"><span className={p.stockQty<=5?'text-red-600 font-bold':'text-gray-800'}>{p.stockQty} {p.sellUnit||p.unit}</span></td>
                    <td className="px-3 py-3 text-center">{p.expiryDays||'--'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                        {p.active?'Dang ban':'An'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      <button onClick={()=>handleEdit(p)} className="text-blue-600 hover:text-blue-800 mr-2 text-xs">Sua</button>
                      <button onClick={()=>handleDelete(p.id)} className="text-red-600 hover:text-red-800 text-xs">Xoa</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal&&(
        <Modal title={editing?'Chinh sua san pham':'Them san pham moi'} onClose={()=>{setShowModal(false);setEditing(null)}}>
          <ProductForm initial={editing} categories={categories} onSubmit={handleSubmit} loading={create.isLoading||update.isLoading}/>
        </Modal>
      )}
    </div>
  )
}
