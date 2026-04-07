/**
 * BarcodeScanner — hỗ trợ 2 chế độ:
 * 1. HID Scanner (máy quét USB/Bluetooth) — hoạt động như bàn phím, gõ nhanh + Enter
 * 2. Camera (ZXing) — chỉ hoạt động khi HTTPS hoặc localhost
 *
 * Cách dùng máy quét HID:
 *  - Cắm máy quét vào USB hoặc kết nối Bluetooth
 *  - Quét mã vạch → máy tự động nhập mã + Enter → component xử lý
 *  - KHÔNG cần HTTPS, KHÔNG cần camera permission
 */
import { useState, useEffect, useRef, useCallback } from 'react'

export default function BarcodeScanner({ products, onScan, onClose }) {
  const [mode, setMode] = useState('hid')          // 'hid' | 'camera'
  const [hidBuffer, setHidBuffer] = useState('')   // buffer nhận từ HID
  const [manualCode, setManualCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [lastScanned, setLastScanned] = useState(null)   // { product, variant }

  const videoRef   = useRef(null)
  const readerRef  = useRef(null)
  const hidInputRef = useRef(null)
  const hidTimerRef = useRef(null)
  const hidBufRef  = useRef('')   // ref để tránh stale closure

  // ── Tìm sản phẩm theo mã ───────────────────────────────────────────────────
  /**
   * [Sprint 0] Tìm theo thứ tự ưu tiên:
   *   1. variant_code của bất kỳ variant nào
   *   2. product.code (→ default variant)
   *   3. product.barcode (legacy)
   * Trả về { product, variant } hoặc null
   */
  const findProduct = useCallback((code) => {
    const normalized = code.trim().toUpperCase()
    // Tìm theo variant_code
    for (const p of products) {
      const variants = p.variants || []
      const matchVariant = variants.find(v => v.variantCode?.toUpperCase() === normalized)
      if (matchVariant) return { product: p, variant: matchVariant }
    }
    // Fallback: tìm theo product.code hoặc barcode → dùng default variant
    const p = products.find(pr =>
      pr.code?.toUpperCase() === normalized ||
      pr.barcode?.toUpperCase() === normalized
    )
    if (p) {
      const defVariant = (p.variants || []).find(v => v.isDefault) || (p.variants || [])[0] || null
      return { product: p, variant: defVariant }
    }
    return null
  }, [products])

  const handleCodeFound = useCallback((code) => {
    const result = findProduct(code)
    if (result) {
      setLastScanned(result)   // { product, variant }
      setError('')
      const variantLabel = result.variant ? ` [${result.variant.variantCode}]` : ''
      setInfo(`✅ Tìm thấy: ${result.product.name}${variantLabel}`)
      onScan(result.product, result.variant)  // [Sprint 0] truyền cả variant
      // Auto clear info sau 2s
      setTimeout(() => setInfo(''), 2000)
    } else {
      setError(`❌ Không tìm thấy sản phẩm với mã: "${code}"`)
    }
  }, [findProduct, onScan])

  // ══════════════════════════════════════════════════════════════════════════
  // CHẾ ĐỘ HID — lắng nghe keyboard global
  // Máy quét HID gõ rất nhanh (< 50ms/ký tự) và kết thúc bằng Enter
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (mode !== 'hid') return

    // Focus input ẩn để capture keyboard
    hidInputRef.current?.focus()

    const handleKeyDown = (e) => {
      // Bỏ qua nếu đang nhập manual
      if (e.target === document.getElementById('manual-input')) return

      if (e.key === 'Enter') {
        const buf = hidBufRef.current.trim()
        if (buf.length >= 2) {
          handleCodeFound(buf)
        }
        hidBufRef.current = ''
        setHidBuffer('')
        clearTimeout(hidTimerRef.current)
        return
      }

      // Chỉ nhận ký tự printable
      if (e.key.length === 1) {
        hidBufRef.current += e.key
        setHidBuffer(hidBufRef.current)

        // Reset buffer nếu không có ký tự mới trong 100ms (kết thúc scan)
        clearTimeout(hidTimerRef.current)
        hidTimerRef.current = setTimeout(() => {
          const buf = hidBufRef.current.trim()
          if (buf.length >= 2) {
            handleCodeFound(buf)
          }
          hidBufRef.current = ''
          setHidBuffer('')
        }, 100)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(hidTimerRef.current)
    }
  }, [mode, handleCodeFound])

  // ══════════════════════════════════════════════════════════════════════════
  // CHẾ ĐỘ CAMERA — dùng ZXing (chỉ hoạt động HTTPS/localhost)
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (mode !== 'camera') return

    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost'
    if (!isSecure) {
      setError('Camera chỉ hoạt động trên HTTPS. Vui lòng dùng máy quét HID.')
      return
    }

    let active = true

    async function startCamera() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (!active) return
        if (devices.length === 0) {
          setError('Không tìm thấy camera trên thiết bị này')
          return
        }

        // Ưu tiên camera sau (index cuối cùng)
        const deviceId = devices[devices.length - 1].deviceId
        setCameraReady(true)
        setError('')

        await reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
          if (!active) return
          if (result) {
            handleCodeFound(result.getText())
          }
        })
      } catch (e) {
        if (active) setError('Lỗi camera: ' + e.message)
      }
    }

    startCamera()
    return () => {
      active = false
      try { readerRef.current?.reset() } catch (_) {}
    }
  }, [mode, handleCodeFound])

  // ── Manual input ──────────────────────────────────────────────────────────
  const handleManual = (e) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    handleCodeFound(code)
    setManualCode('')
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-green-700 text-white">
          <h3 className="font-bold text-lg">🔍 Quét mã sản phẩm</h3>
          <button onClick={onClose} className="text-2xl leading-none hover:opacity-70">&times;</button>
        </div>

        <div className="p-4 space-y-4">

          {/* Mode Switcher */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            <button
              onClick={() => { setMode('hid'); setError(''); setCameraReady(false) }}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${
                mode === 'hid'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              🔌 Máy quét (HID/USB)
            </button>
            <button
              onClick={() => { setMode('camera'); setError('') }}
              className={`flex-1 py-2.5 text-sm font-semibold transition ${
                mode === 'camera'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              📷 Camera
            </button>
          </div>

          {/* ── HID Mode UI ──────────────────────────────────────────────── */}
          {mode === 'hid' && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-4xl mb-2">🔌</div>
                <p className="font-semibold text-green-800 text-sm">Máy quét đang hoạt động</p>
                <p className="text-xs text-green-600 mt-1">
                  Cắm máy quét USB hoặc kết nối Bluetooth, sau đó quét mã vạch
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Máy quét HID tự động nhập mã như bàn phím — không cần HTTPS
                </p>
              </div>

              {/* HID buffer hiển thị */}
              {hidBuffer && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-center">
                  <p className="text-xs text-yellow-600 mb-1">Đang nhận mã...</p>
                  <p className="font-mono font-bold text-yellow-800 text-lg tracking-widest">{hidBuffer}</p>
                </div>
              )}

              {/* Last scanned */}
              {lastScanned && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-xs text-blue-500 mb-1">Sản phẩm vừa quét:</p>
                  <p className="font-semibold text-blue-800">{lastScanned.product.name}</p>
                  {lastScanned.variant
                    ? <p className="text-xs text-blue-600">
                        [{lastScanned.variant.variantCode}] {lastScanned.variant.variantName} |
                        Giá: {Number(lastScanned.variant.sellPrice).toLocaleString('vi-VN')} ₫/{lastScanned.variant.sellUnit}
                      </p>
                    : <p className="text-xs text-blue-600">Mã: {lastScanned.product.code}</p>
                  }
                </div>
              )}
            </div>
          )}

          {/* ── Camera Mode UI ───────────────────────────────────────────── */}
          {mode === 'camera' && (
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '4/3' }}>
              <video ref={videoRef} className="w-full h-full object-cover" />
              {/* Scan frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 border-4 border-green-400 rounded-xl shadow-lg">
                  {/* Corners */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-300 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-300 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-300 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-300 rounded-br-lg" />
                </div>
              </div>
              {cameraReady && (
                <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-white bg-black/50 py-1">
                  Đưa mã vạch vào khung xanh
                </div>
              )}
            </div>
          )}

          {/* Error / Info */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}
          {info && !error && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <p className="text-green-700 text-sm text-center font-medium">{info}</p>
            </div>
          )}

          {/* Manual input */}
          <div className="border-t pt-3">
            <p className="text-xs text-gray-500 mb-2 text-center">Hoặc nhập mã thủ công</p>
            <form onSubmit={handleManual} className="flex gap-2">
              <input
                id="manual-input"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Nhập mã sản phẩm (VD: BT001)..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoComplete="off"
              />
              <button type="submit"
                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 font-medium">
                Thêm
              </button>
            </form>
          </div>

          {/* HID instruction */}
          {mode === 'hid' && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p className="font-semibold text-gray-600">💡 Hướng dẫn kết nối máy quét:</p>
              <p>• <b>USB:</b> Cắm cáp USB vào máy tính → tự nhận diện, không cần driver</p>
              <p>• <b>Bluetooth:</b> Bật Bluetooth, ghép đôi máy quét → quét như bình thường</p>
              <p>• <b>2.4GHz Wireless:</b> Cắm USB dongle → hoạt động ngay</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
