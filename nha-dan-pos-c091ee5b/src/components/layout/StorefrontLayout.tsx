import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";
import type { SVGProps } from "react";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { StorefrontNav } from "./StorefrontNav";

export function StorefrontLayout() {
  return (
    <div className="min-h-screen bg-storefront-bg text-foreground flex flex-col">
      <StorefrontNav />
      <main className="pb-20 md:pb-0 flex-1">
        <Outlet />
      </main>
      <StorefrontFooter />
    </div>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2V8.6H15.2c-1.24 0-1.63.78-1.63 1.57v1.89h2.77l-.44 2.91h-2.33V22C18.34 21.24 22 17.08 22 12.06Z" />
    </svg>
  );
}

function StorefrontFooter() {
  return (
    <footer className="mt-8 md:mt-12 border-t bg-card pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-10 grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8">
        <div className="space-y-3">
          <Link to="/" className="inline-flex items-center" aria-label="Nhã Đan Shop">
            <BrandLogo variant="compact" className="h-12 max-w-[170px]" />
          </Link>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bánh tráng, muối và đồ ăn vặt Việt Nam, đóng gói kỹ, giá tốt mỗi ngày, giao nhanh nội thành.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <a
              href="https://facebook.com/LinhTinhStore94"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <FacebookIcon className="h-3.5 w-3.5 text-[#1877F2]" />
              <span>Facebook · Linh Tinh Store</span>
            </a>
            <a
              href="https://zalo.me/0975505074"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#0068FF] text-[8px] font-bold text-white">Z</span>
              <span>Zalo · 0975505074</span>
            </a>
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Mua sắm</h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li><Link to="/products" className="hover:text-foreground">Tất cả sản phẩm</Link></li>
            <li><Link to="/combos" className="hover:text-foreground">Combo ưu đãi</Link></li>
            <li><Link to="/cart" className="hover:text-foreground">Giỏ hàng</Link></li>
            <li><Link to="/account" className="hover:text-foreground">Đơn hàng của tôi</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Hỗ trợ</h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li><a href="#" className="hover:text-foreground">Chính sách đổi trả</a></li>
            <li><a href="#" className="hover:text-foreground">Vận chuyển & Giao hàng</a></li>
            <li><a href="#" className="hover:text-foreground">Phương thức thanh toán</a></li>
            <li><a href="#" className="hover:text-foreground">Câu hỏi thường gặp</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold mb-3">Liên hệ</h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2 min-w-0 break-words">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">235 ấp 5, xã Mỏ Cày, Vĩnh Long</span>
            </li>
            <li className="flex items-start gap-2 min-w-0 break-words">
              <Phone className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">0975505074</span>
            </li>
            <li className="flex items-start gap-2 min-w-0 break-words">
              <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">duongthimylinh94@gmail.com</span>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <p className="min-w-0 break-words">© 2025 Nhã Đan Shop. Mọi quyền được bảo lưu.</p>
          <p className="min-w-0 break-words">Thiết kế cho người Việt — vận hành mỗi ngày.</p>
        </div>
      </div>
    </footer>
  );
}
