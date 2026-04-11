/**
 * AdminTable — Responsive table component
 * - Desktop (md+): hiển thị dạng table truyền thống
 * - Mobile (< md): hiển thị dạng card list thân thiện
 *
 * Props:
 *   columns: [{ key, label, className, mobileLabel, render, hideOnMobile }]
 *   rows: array of data objects
 *   keyField: string (default 'id')
 *   loading: boolean
 *   emptyText: string
 *   mobileCard: (row) => JSX  ← optional: hoàn toàn custom card
 */
export function AdminTable({ columns, rows, keyField = 'id', loading, emptyText = 'Không có dữ liệu', mobileCard }) {
  if (loading) {
    return (
      <div className="py-12 text-center text-gray-400">
        <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-amber-500 rounded-full animate-spin mb-3" />
        <p className="text-sm">Đang tải...</p>
      </div>
    )
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm">{emptyText}</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Desktop table (md+) ─────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 border-b">
              {columns.map(col => (
                <th key={col.key}
                  className={`text-left px-3 py-3 font-semibold text-xs uppercase tracking-wide ${col.thClassName || ''}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row[keyField]} className="border-b hover:bg-gray-50 transition">
                {columns.map(col => (
                  <td key={col.key} className={`px-3 py-3 ${col.tdClassName || ''}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list (< md) ─────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {rows.map(row => (
          <div key={row[keyField]}
            className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            {mobileCard
              ? mobileCard(row)
              : <DefaultMobileCard row={row} columns={columns} />
            }
          </div>
        ))}
      </div>
    </>
  )
}

function DefaultMobileCard({ row, columns }) {
  const visibleCols = columns.filter(c => !c.hideOnMobile)
  const actionCol = columns.find(c => c.isAction)
  const mainCols = visibleCols.filter(c => !c.isAction)

  return (
    <div className="space-y-1.5">
      {mainCols.map(col => (
        <div key={col.key} className="flex items-start justify-between gap-2 text-sm">
          {col.mobileLabel !== false && (
            <span className="text-gray-400 text-xs shrink-0 min-w-[70px] pt-0.5">
              {col.mobileLabel || col.label}
            </span>
          )}
          <span className={`text-gray-800 font-medium text-right flex-1 ${col.tdClassName || ''}`}>
            {col.render ? col.render(row) : (row[col.key] ?? '—')}
          </span>
        </div>
      ))}
      {actionCol && (
        <div className="pt-2 border-t border-gray-100 flex justify-end">
          {actionCol.render(row)}
        </div>
      )}
    </div>
  )
}

/**
 * AdminPageHeader — Responsive page header với title + actions
 */
export function AdminPageHeader({ title, actions }) {
  return (
    <div className="flex items-center gap-3 justify-between min-w-0">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 truncate min-w-0">{title}</h2>
      {actions && (
        <div className="flex flex-shrink-0 flex-wrap gap-2 items-center">
          {actions}
        </div>
      )}
    </div>
  )
}

/**
 * AdminFilters — Responsive filter bar
 */
export function AdminFilters({ children }) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap sm:items-end">
      {children}
    </div>
  )
}

/**
 * AdminCard — White card wrapper
 */
export function AdminCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 ${className}`}>
      {children}
    </div>
  )
}
