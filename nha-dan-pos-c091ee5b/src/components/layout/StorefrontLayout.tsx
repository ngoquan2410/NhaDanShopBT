import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";
import { Store, Phone, Mail, MapPin } from "lucide-react";
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

function StorefrontFooter() {
  return (
    <footer className="mt-12 border-t bg-card hidden md:block">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-hover text-primary-foreground flex items-center justify-center">
              <Store className="h-5 w-5" />
            </div>
            <span className="font-bold">Nhã Đan Shop</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tạp hóa hiện đại — hàng thiết yếu chính hãng, giá tốt mỗi ngày, giao nhanh nội thành.
          </p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="px-2 py-1 rounded-full border">FB · Nhã Đan Shop</span>
            <span className="px-2 py-1 rounded-full border">IG · @nhadanshop</span>
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
            <li className="flex items-start gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> 123 Nguyễn Văn Linh, Q7, TP.HCM</li>
            <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> 1900 1234</li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> hello@nhadanshop.vn</li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <p>© 2025 Nhã Đan Shop. Mọi quyền được bảo lưu.</p>
          <p>Thiết kế cho người Việt — vận hành mỗi ngày.</p>
        </div>
      </div>
    </footer>
  );
}
