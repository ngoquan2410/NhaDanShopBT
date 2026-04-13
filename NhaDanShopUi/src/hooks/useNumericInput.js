/**
 * useNumericInput — helper tạo props cho input số
 *
 * Cho phép xóa trống khi đang gõ (Backspace hoạt động bình thường).
 * Chỉ fallback về min khi blur và giá trị trống / nhỏ hơn min.
 *
 * @param value       - giá trị hiện tại (number | string)
 * @param onChange    - callback(newValue: number | string)
 * @param options     - { min, max, allowDecimal, fallbackValue }
 *
 * Sử dụng:
 *   const props = useNumericInput(qty, setQty, { min: 1 })
 *   <input type="text" inputMode="numeric" {...props} />
 */
export function useNumericInput(value, onChange, options = {}) {
  const {
    min = 0,
    max = Infinity,
    allowDecimal = false,
    fallbackValue = min,   // giá trị dùng khi blur mà trống / < min
  } = options

  const pattern = allowDecimal ? /[^\d.]/g : /\D/g

  const handleChange = (e) => {
    const raw = e.target.value.replace(pattern, '')
    // Cho phép trống (đang xóa) hoặc giá trị hợp lệ
    if (raw === '' || raw === '.') {
      onChange('')
      return
    }
    const num = allowDecimal ? parseFloat(raw) : parseInt(raw, 10)
    if (isNaN(num)) { onChange(''); return }
    if (max !== Infinity && num > max) return  // không cho nhập quá max
    onChange(raw)  // giữ dạng string khi đang nhập để không mất trailing zero/dot
  }

  const handleBlur = () => {
    const num = allowDecimal ? parseFloat(String(value)) : parseInt(String(value), 10)
    if (value === '' || value === null || value === undefined || isNaN(num) || num < min) {
      onChange(fallbackValue)
    } else if (max !== Infinity && num > max) {
      onChange(max)
    } else {
      onChange(num) // normalize về number khi blur
    }
  }

  return {
    type: 'text',
    inputMode: allowDecimal ? 'decimal' : 'numeric',
    value: value === null || value === undefined ? '' : value,
    onChange: handleChange,
    onBlur: handleBlur,
  }
}
