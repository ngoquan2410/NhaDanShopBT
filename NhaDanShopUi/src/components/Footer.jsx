export default function Footer() {
  return (
    <footer className="mt-auto" style={{background:'linear-gradient(90deg,#92400e 0%,#b45309 50%,#92400e 100%)'}}>
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        {/* Mobile: stacked, Desktop: 3-col grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {/* Shop info */}
          <div>
            <h3 className="text-base sm:text-lg font-bold mb-2 flex items-center gap-2 text-amber-100">
              🛒 Nhã Đan Shop
            </h3>
            <p className="text-amber-200 text-sm leading-relaxed">
              Hàng tươi ngon – Giá cả hợp lý – Phục vụ tận tâm
            </p>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2 mt-1 sm:mt-0">
              Thông tin liên hệ
            </h3>
            <div className="space-y-1.5 text-sm text-amber-100">
              <p className="font-medium text-white">👤 Dương Thị Mỹ Linh</p>
              <p className="text-xs sm:text-sm">📍 235, Ấp 5, Xã Mỏ Cày, Tỉnh Vĩnh Long</p>
              <p>
                📞{' '}
                <a href="tel:0975505074" className="hover:text-white underline">0975 505 074</a>
                {' '}–{' '}
                <a href="tel:0996425503" className="hover:text-white underline">0996 425 503</a>
              </p>
            </div>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 mb-2 mt-1 sm:mt-0">
              Kết nối
            </h3>
            <div className="flex sm:flex-col gap-3 sm:gap-2 text-sm flex-wrap">
              <a href="https://www.facebook.com/duongthi.mylinh.5" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-amber-100 hover:text-white transition">
                <span className="text-blue-400 text-lg">📘</span>
                <span>Facebook</span>
              </a>
              <a href="https://zalo.me/0975505074" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-amber-100 hover:text-white transition">
                <span className="text-blue-300 text-lg">💬</span>
                <span>Zalo: 0975 505 074</span>
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-amber-700/50 mt-5 pt-4 text-center text-xs text-amber-300">
          © {new Date().getFullYear()} Nhã Đan Shop. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
