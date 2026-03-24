#!/bin/bash
# =============================================================================
# NhaDanShop API - CURL Test Commands
# Base URL: http://localhost:8080
# Admin:  admin / admin123
# User:   user  / user123
# =============================================================================

BASE="http://localhost:8080"
ADMIN="-u admin:admin123"
USER="-u user:user123"
JSON='-H "Content-Type: application/json"'

echo ""
echo "========================================================"
echo " NHADAN SHOP - CURL TEST GUIDE"
echo " Chạy từng lệnh sau khi đã start Spring Boot app"
echo "========================================================"


# ================================================================
# 1. CATEGORIES
# ================================================================

echo ""
echo "--- 1. CATEGORIES ---"

# GET tất cả danh mục
curl -s $USER "$BASE/api/categories" | python -m json.tool

# GET danh mục theo ID
curl -s $USER "$BASE/api/categories/1" | python -m json.tool

# POST tạo danh mục mới (cần ADMIN)
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bánh Tráng Trộn",
    "description": "Các loại bánh tráng trộn đặc sản Tây Ninh",
    "active": true
  }' \
  "$BASE/api/categories" | python -m json.tool

# POST tạo danh mục thứ 2
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bánh Tráng Nướng",
    "description": "Bánh tráng nướng các loại",
    "active": true
  }' \
  "$BASE/api/categories" | python -m json.tool

# PUT cập nhật danh mục
curl -s -X PUT $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bánh Tráng Trộn (Cập nhật)",
    "description": "Mô tả mới",
    "active": true
  }' \
  "$BASE/api/categories/1" | python -m json.tool

# DELETE danh mục (soft delete)
curl -s -X DELETE $ADMIN "$BASE/api/categories/1" -w "HTTP Status: %{http_code}\n"

# TEST 403 - User thường không được tạo category
curl -s -X POST $USER \
  -H "Content-Type: application/json" \
  -d '{"name":"Forbidden Test"}' \
  "$BASE/api/categories" | python -m json.tool


# ================================================================
# 2. PRODUCTS
# ================================================================

echo ""
echo "--- 2. PRODUCTS ---"

# Tạo 2 sản phẩm trước (categoryId=1 phải tồn tại)
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "code": "BT001",
    "name": "Bánh Tráng Tây Ninh Loại 1",
    "categoryId": 1,
    "unit": "goi",
    "costPrice": 15000.00,
    "sellPrice": 22000.00,
    "stockQty": 0,
    "active": true
  }' \
  "$BASE/api/products" | python -m json.tool

curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "code": "BT002",
    "name": "Bánh Tráng Phơi Sương",
    "categoryId": 1,
    "unit": "goi",
    "costPrice": 20000.00,
    "sellPrice": 30000.00,
    "stockQty": 0,
    "active": true
  }' \
  "$BASE/api/products" | python -m json.tool

# GET tất cả sản phẩm
curl -s $USER "$BASE/api/products" | python -m json.tool

# GET sản phẩm theo category (có phân trang)
curl -s $USER "$BASE/api/products/category/1?page=0&size=10" | python -m json.tool

# GET sản phẩm theo ID
curl -s $USER "$BASE/api/products/1" | python -m json.tool

# PUT cập nhật sản phẩm
curl -s -X PUT $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "code": "BT001",
    "name": "Bánh Tráng Tây Ninh Loại 1 (Updated)",
    "categoryId": 1,
    "unit": "goi",
    "costPrice": 16000.00,
    "sellPrice": 25000.00,
    "stockQty": 100,
    "active": true
  }' \
  "$BASE/api/products/1" | python -m json.tool

# DELETE sản phẩm (soft delete)
curl -s -X DELETE $ADMIN "$BASE/api/products/1" -w "HTTP Status: %{http_code}\n"


# ================================================================
# 3. INVENTORY RECEIPTS (Nhập hàng)
# ================================================================

echo ""
echo "--- 3. INVENTORY RECEIPTS (Nhập hàng) ---"

# POST tạo phiếu nhập hàng (productId 1 và 2 phải tồn tại)
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "supplierName": "Công ty TNHH Bánh Tráng Tây Ninh",
    "note": "Nhập hàng tháng 3/2026",
    "items": [
      {
        "productId": 1,
        "quantity": 200,
        "unitCost": 15000.00
      },
      {
        "productId": 2,
        "quantity": 150,
        "unitCost": 20000.00
      }
    ]
  }' \
  "$BASE/api/receipts" | python -m json.tool

# GET danh sách phiếu nhập (có phân trang)
curl -s $ADMIN "$BASE/api/receipts?page=0&size=10" | python -m json.tool

# GET lọc theo ngày
curl -s $ADMIN "$BASE/api/receipts?from=2026-01-01&to=2026-12-31&page=0&size=10" | python -m json.tool

# GET phiếu nhập theo ID
curl -s $ADMIN "$BASE/api/receipts/1" | python -m json.tool


# ================================================================
# 4. SALES INVOICES (Hóa đơn bán hàng)
# ================================================================

echo ""
echo "--- 4. SALES INVOICES (Hóa đơn bán hàng) ---"

# POST tạo hóa đơn bán hàng (User thường cũng tạo được)
curl -s -X POST $USER \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Nguyễn Văn An",
    "note": "Khách quen, giao hàng tận nhà",
    "items": [
      {
        "productId": 1,
        "quantity": 5
      },
      {
        "productId": 2,
        "quantity": 3
      }
    ]
  }' \
  "$BASE/api/invoices" | python -m json.tool

# POST tạo hóa đơn thứ 2
curl -s -X POST $USER \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Trần Thị Bình",
    "items": [
      {
        "productId": 1,
        "quantity": 10
      }
    ]
  }' \
  "$BASE/api/invoices" | python -m json.tool

# GET tất cả hóa đơn
curl -s $USER "$BASE/api/invoices?page=0&size=10" | python -m json.tool

# GET lọc hóa đơn theo ngày
curl -s $USER "$BASE/api/invoices?from=2026-03-01&to=2026-03-31&page=0&size=10" | python -m json.tool

# GET hóa đơn theo ID
curl -s $USER "$BASE/api/invoices/1" | python -m json.tool

# TEST lỗi hết hàng
curl -s -X POST $USER \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Test Hết Hàng",
    "items": [{"productId": 1, "quantity": 99999}]
  }' \
  "$BASE/api/invoices" | python -m json.tool

# DELETE hóa đơn (Admin, hoàn tồn kho)
curl -s -X DELETE $ADMIN "$BASE/api/invoices/1" -w "HTTP Status: %{http_code}\n"


# ================================================================
# 5. REPORTS (Thống kê lợi nhuận - Admin only)
# ================================================================

echo ""
echo "--- 5. REPORTS (Thống kê lợi nhuận) ---"

# Thống kê tuần này
curl -s $ADMIN "$BASE/api/reports/profit/this-week" | python -m json.tool

# Thống kê tháng này
curl -s $ADMIN "$BASE/api/reports/profit/this-month" | python -m json.tool

# Thống kê theo khoảng ngày tùy chỉnh
curl -s $ADMIN "$BASE/api/reports/profit?from=2026-03-01&to=2026-03-31" | python -m json.tool

# Thống kê từng tuần trong Q1/2026
curl -s $ADMIN "$BASE/api/reports/profit/weekly?from=2026-01-01&to=2026-03-31" | python -m json.tool

# Thống kê từng tháng trong 2026
curl -s $ADMIN "$BASE/api/reports/profit/monthly?from=2026-01-01&to=2026-12-31" | python -m json.tool

# TEST 403 - User thường không xem được report
curl -s $USER "$BASE/api/reports/profit/this-month" | python -m json.tool


# ================================================================
# 6. USER MANAGEMENT (Admin only)
# ================================================================

echo ""
echo "--- 6. USER MANAGEMENT ---"

# GET danh sách users
curl -s $ADMIN "$BASE/api/admin/users?page=0&size=10" | python -m json.tool

# POST tạo user mới
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "username": "nhanvien01",
    "password": "nhanvien123",
    "fullName": "Nhân Viên 01",
    "roles": ["ROLE_USER"]
  }' \
  "$BASE/api/admin/users" | python -m json.tool

# POST tạo admin mới
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin2",
    "password": "admin456",
    "fullName": "Admin 2",
    "roles": ["ROLE_ADMIN"]
  }' \
  "$BASE/api/admin/users" | python -m json.tool

# GET user theo ID
curl -s $ADMIN "$BASE/api/admin/users/3" | python -m json.tool

# PUT cập nhật user
curl -s -X PUT $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Nhân Viên 01 (Updated)",
    "isActive": true,
    "roles": ["ROLE_USER"]
  }' \
  "$BASE/api/admin/users/3" | python -m json.tool

# DELETE (vô hiệu hoá) user
curl -s -X DELETE $ADMIN "$BASE/api/admin/users/3" -w "HTTP Status: %{http_code}\n"

# TEST 401 - Chưa đăng nhập
curl -s "$BASE/api/admin/users" | python -m json.tool


# ================================================================
# 7. VALIDATION TESTS
# ================================================================

echo ""
echo "--- 7. VALIDATION TESTS ---"

# Category tên rỗng → 400
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{"name":"","description":"test"}' \
  "$BASE/api/categories" | python -m json.tool

# Product giá âm → 400
curl -s -X POST $ADMIN \
  -H "Content-Type: application/json" \
  -d '{
    "code":"INVALID01","name":"Test",
    "categoryId":1,"unit":"goi",
    "costPrice":-100,"sellPrice":-200,"stockQty":0
  }' \
  "$BASE/api/products" | python -m json.tool

# Invoice không có items → 400
curl -s -X POST $USER \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","items":[]}' \
  "$BASE/api/invoices" | python -m json.tool

# Product không tồn tại → 404
curl -s $USER "$BASE/api/products/99999" | python -m json.tool

echo ""
echo "========================================================"
echo " DONE! Kiểm tra kết quả ở trên."
echo "========================================================"
