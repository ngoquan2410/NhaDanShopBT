import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { StorefrontLayout } from "@/components/layout/StorefrontLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminAuthGuard } from "@/components/layout/AdminAuthGuard";
import { AdminAuthProvider } from "@/lib/admin-auth";
import AdminLoginPage from "@/pages/admin/AdminLogin";

import StorefrontHome from "@/pages/storefront/Home";
import StorefrontProducts from "@/pages/storefront/Products";
import CartPage from "@/pages/storefront/Cart";
import CheckoutPage from "@/pages/storefront/Checkout";
import PendingPaymentPage from "@/pages/storefront/PendingPayment";
import LoginPage from "@/pages/storefront/Login";
import SignupPage from "@/pages/storefront/Signup";
import AccountPage from "@/pages/storefront/Account";
import StorefrontProductDetail from "@/pages/storefront/ProductDetail";
import StorefrontCombos from "@/pages/storefront/Combos";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminCategories from "@/pages/admin/Categories";
import AdminProducts from "@/pages/admin/Products";
import AdminProductDetail from "@/pages/admin/ProductDetail";
import AdminCombos from "@/pages/admin/Combos";
import AdminPOS from "@/pages/admin/POS";
import AdminInvoices from "@/pages/admin/Invoices";
import AdminPendingOrders from "@/pages/admin/PendingOrders";
import AdminUnmatchedPayments from "@/pages/admin/UnmatchedPayments";
import AdminPromotions from "@/pages/admin/Promotions";
import AdminVouchers from "@/pages/admin/Vouchers";
import AdminCustomers from "@/pages/admin/Customers";
import AdminSuppliers from "@/pages/admin/Suppliers";
import AdminGoodsReceipts from "@/pages/admin/GoodsReceipts";
import AdminGoodsReceiptCreate from "@/pages/admin/GoodsReceiptCreate";
import AdminStockAdjustments from "@/pages/admin/StockAdjustments";
import AdminStockAdjustmentCreate from "@/pages/admin/StockAdjustmentCreate";
import AdminInventoryReport from "@/pages/admin/InventoryReport";
import AdminRevenueReport from "@/pages/admin/RevenueReport";
import AdminProfitReport from "@/pages/admin/ProfitReport";
import AdminUsers from "@/pages/admin/UsersManagement";
import AdminSecurity from "@/pages/admin/Security";
import AdminStoreSettings from "@/pages/admin/StoreSettings";
import AdminShippingSettings from "@/pages/admin/ShippingSettings";
import AdminGhnQuoteLogs from "@/pages/admin/GhnQuoteLogs";
import AdminGoongTest from "@/pages/admin/GoongTestPage";

import PlaceholderPage from "@/pages/PlaceholderPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AdminAuthProvider>
          <Routes>
            {/* Storefront */}
            <Route element={<StorefrontLayout />}>
              <Route path="/" element={<StorefrontHome />} />
              <Route path="/products" element={<StorefrontProducts />} />
              <Route path="/products/:id" element={<StorefrontProductDetail />} />
              <Route path="/combos" element={<StorefrontCombos />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/pending-payment" element={<PendingPaymentPage />} />
              <Route path="/pending-payment/:id" element={<PendingPaymentPage />} />
              <Route path="/account" element={<AccountPage />} />
            </Route>

            {/* Auth (no layout) */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />

            {/* Admin login (Supabase auth) */}
            <Route path="/admin/login" element={<AdminLoginPage />} />

            {/* Admin (guarded) */}
            <Route
              path="/admin"
              element={
                <AdminAuthGuard>
                  <AdminLayout />
                </AdminAuthGuard>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="categories" element={<AdminCategories />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="products/new" element={<AdminProductDetail />} />
              <Route path="products/:id" element={<AdminProductDetail />} />
              <Route path="combos" element={<AdminCombos />} />
              <Route path="pos" element={<AdminPOS />} />
              <Route path="invoices" element={<AdminInvoices />} />
              <Route path="pending-orders" element={<AdminPendingOrders />} />
              <Route path="unmatched-payments" element={<AdminUnmatchedPayments />} />
              <Route path="promotions" element={<AdminPromotions />} />
              <Route path="vouchers" element={<AdminVouchers />} />
              <Route path="goods-receipts" element={<AdminGoodsReceipts />} />
              <Route path="goods-receipts/create" element={<AdminGoodsReceiptCreate />} />
              <Route path="stock-adjustments" element={<AdminStockAdjustments />} />
              <Route path="stock-adjustments/create" element={<AdminStockAdjustmentCreate />} />
              <Route path="inventory-report" element={<AdminInventoryReport />} />
              <Route path="revenue" element={<AdminRevenueReport />} />
              <Route path="profit" element={<AdminProfitReport />} />
              <Route path="customers" element={<AdminCustomers />} />
              <Route path="suppliers" element={<AdminSuppliers />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="security" element={<AdminSecurity />} />
              <Route path="store-settings" element={<AdminStoreSettings />} />
              <Route path="shipping-settings" element={<AdminShippingSettings />} />
              <Route path="ghn-quote-logs" element={<AdminGhnQuoteLogs />} />
              <Route path="goong-test" element={<AdminGoongTest />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AdminAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
