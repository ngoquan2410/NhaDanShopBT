import { useState, useMemo } from 'react'

/**
 * Reusable sort hook for client-side table sorting.
 * Usage:
 *   const { sorted, SortHeader } = useSort(data, 'name')
 *   <SortHeader field="name">Tên</SortHeader>
 */
export function useSort(data = [], defaultField = '', defaultDir = 'asc') {
  const [field, setField] = useState(defaultField)
  const [dir, setDir] = useState(defaultDir)

  const toggle = (f) => {
    if (f === field) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setField(f); setDir('asc') }
  }

  const sorted = useMemo(() => {
    if (!field) return data
    return [...data].sort((a, b) => {
      let av = a[field], bv = b[field]
      if (av == null) av = ''
      if (bv == null) bv = ''
      // numeric compare
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av
      }
      // string compare (including BigDecimal strings)
      const an = parseFloat(av), bn = parseFloat(bv)
      if (!isNaN(an) && !isNaN(bn)) {
        return dir === 'asc' ? an - bn : bn - an
      }
      const as = String(av).toLowerCase(), bs = String(bv).toLowerCase()
      return dir === 'asc' ? as.localeCompare(bs, 'vi') : bs.localeCompare(as, 'vi')
    })
  }, [data, field, dir])

  const SortHeader = ({ field: f, children, className = '' }) => (
    <th
      onClick={() => toggle(f)}
      className={`cursor-pointer select-none group ${className}`}
    >
      <span className="flex items-center gap-1">
        {children}
        <span className="text-gray-400 group-hover:text-gray-600 transition text-xs">
          {field === f ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )

  return { sorted, field, dir, toggle, SortHeader }
}
