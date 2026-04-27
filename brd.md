# BRD – NhaDanShop UI Business Requirements

> Basis of analysis: derived primarily from the `NhaDanShopUi` frontend behavior, with one attached backend bootstrap file confirming the system timezone is set to `Asia/Ho_Chi_Minh` (UTC+7).

## 1. Overview of the System

`NhaDanShopUI` supports a small retail operation with both:

- Public storefront / lightweight e-commerce
- Admin back-office / POS / inventory management

The system covers these business areas:

- User registration and login
- Mandatory 2FA/TOTP onboarding for new accounts
- Public browsing of products and combos
- Customer ordering with cash or online transfer methods
- Admin confirmation of online payments before invoice creation
- Product, variant, category, combo, supplier, customer, and user management
- Goods receipt / stock-in operations
- Sales invoice creation and cancellation
- Inventory, profit, and revenue reporting
- Stocktake / stock adjustment workflows
- Barcode scanning and barcode label printing

The UI indicates this is a retail inventory + sales control system with support for:
- multi-variant products,
- FEFO/expiry-aware inventory,
- promotional programs,
- pending online payment verification,
- and both walk-in and online-style ordering.

## 2. User Roles

### 2.1 Detectable roles

#### 1) Public visitor
Can:
- access `/store`
- browse products and combos
- search/filter products
- add items to cart

Cannot:
- complete checkout without login

#### 2) Authenticated standard user (`ROLE_USER`)
Can:
- log in
- access storefront
- place orders from storefront
- use cash or online payment methods
- wait for admin confirmation of online payments

#### 3) Admin (`ROLE_ADMIN`)
Can access all admin routes and perform:
- master data management
- inventory operations
- invoice creation/cancellation/deletion
- pending order confirmation/cancellation
- user management
- security settings
- reports

### 2.2 Role-based behavior

- Admin routes are protected by both:
  - authenticated session
  - admin role
- Non-admin users attempting admin access are redirected to storefront.
- Public storefront avoids permission-error noise; admin-side unauthorized actions show error feedback.

## 3. Page Structure and Navigation Flow

### 3.1 Main navigation

#### Public
- `/` → redirects to `/store`
- `/store`
- `/login`
- `/signup`

#### Admin
- `/admin/dashboard`
- `/admin/categories`
- `/admin/products`
- `/admin/receipts`
- `/admin/invoices`
- `/admin/inventory-report`
- `/admin/profit-report`
- `/admin/revenue`
- `/admin/promotions`
- `/admin/combos`
- `/admin/customers`
- `/admin/suppliers`
- `/admin/stock-adjustments`
- `/admin/users`
- `/admin/security`

### 3.2 Navigation intent

The admin menu implies these operational priorities:

1. Dashboard / monitoring
2. Product and category setup
3. Stock-in
4. Sales invoicing
5. Inventory control
6. Reporting
7. Marketing / promotions
8. Customer and supplier maintenance
9. Security and access control

## 4. Functional Requirements by Module

### 4.1 Authentication and Account Security

#### Functional requirements
- The system shall allow users to log in with username and password.
- The system shall support a second-step TOTP verification flow when TOTP is enabled.
- The system shall allow new users to register.
- The system shall force newly registered users to complete TOTP setup before account use is considered complete.
- The system shall store access token, refresh token, and user profile locally.
- The system shall refresh access tokens automatically before expiry.
- The system shall synchronize login/logout state across browser tabs.
- The system shall support logout from the current device.
- The system shall support logout from all devices by revoking all refresh tokens.
- The system shall allow a logged-in user to enable or disable TOTP from security settings.

#### Business meaning
The business requires strong account protection, especially through:
- mandatory 2FA at signup
- session continuity
- forced re-authentication when refresh fails

### 4.2 Storefront / Customer Ordering

#### Functional requirements
- The system shall display active sellable products to the public.
- The system shall display active, in-stock combos separately.
- The system shall support:
  - search by name/code/category
  - category filtering
  - tabs for all products, hot-selling items, and combos
- The system shall show stock state indicators:
  - out of stock
  - low stock / nearly out
- The system shall allow customers to:
  - choose variant (if multiple)
  - choose quantity
  - add product/combo to cart
  - adjust cart quantities
  - remove items from cart

#### Business meaning
The storefront acts as a simplified online ordering channel, but inventory awareness is important. Customers are only allowed to order what is currently available.

### 4.3 Checkout and Payment Handling

#### Functional requirements
- The system shall require login before checkout.
- The system shall support customer identification by:
  - selecting an existing customer
  - entering a guest name
- The system shall allow order note entry.
- The system shall allow promotion selection during checkout.
- The system shall support payment methods:
  - cash
  - bank transfer
  - MoMo
  - ZaloPay

#### Payment behavior
##### Cash
- The UI creates an invoice immediately.

##### Online methods
- The UI creates a pending order, not a final invoice.
- The user sees payment instructions and an order status screen.
- The order remains pending until admin confirms payment.
- Only after admin confirmation does the invoice get created and stock get deducted.

#### Business meaning
The business separates:
- cash sales = immediate sale
- transfer/wallet sales = reserve first, confirm after payment verification

This reflects a manual bank/wallet reconciliation process.

### 4.4 Pending Online Orders

#### Functional requirements
- The system shall let admins view all pending orders.
- The system shall let admins filter by status:
  - pending
  - confirmed
  - cancelled
  - all
- The system shall show payment method, total amount, customer, timestamp, and expiry countdown.
- The system shall allow admins to:
  - confirm payment received
  - cancel pending order

#### Business meaning
Pending orders are a controlled pre-sale state used to:
- temporarily reserve demand,
- wait for incoming payment proof/balance movement,
- reduce overselling risk.

### 4.5 Dashboard and Alerts

#### Functional requirements
- The system shall show profit and revenue summaries for:
  - current week
  - current month
- The system shall show:
  - expired lots
  - soon-to-expire lots
  - low-stock variants
- The system shall trigger a once-per-day local notification around 9AM for expiry alerts.

#### Business meaning
The dashboard is intended as a daily operations cockpit:
- sales health
- expiry risk
- replenishment risk

### 4.6 Categories

#### Functional requirements
- Admin shall create, update, and delete categories.
- Category records include:
  - name
  - description
  - active flag
- Active categories are used in product filtering and likely storefront visibility logic.

#### Business meaning
Categories organize products for:
- storefront browsing
- reporting
- promotion scoping
- master data maintenance

### 4.7 Products and Variants

#### Functional requirements
- Admin shall create products under a selected category.
- Product code can be suggested automatically based on category.
- Product can be:
  - `SINGLE`
  - `COMBO`
- Single products may contain one or more variants.
- Each variant shall support:
  - variant code
  - variant name
  - sell unit
  - import unit
  - pieces per import unit
  - sell price
  - cost price
  - stock quantity
  - minimum stock threshold
  - expiry days
  - default flag
  - conversion note
- Admin shall edit/delete products.
- Admin shall manage variants separately after product creation.
- Admin shall upload or link product images.
- Admin shall import products from Excel with preview validation.

#### Business meaning
The product model is built around variant-level commercial control, not just product-level control.
A product may represent a family, while the variant is the true operational SKU.

Examples implied:
- same product in 200g / 500g packs
- different sell units and conversion ratios
- distinct stock and pricing per variant

### 4.8 Combos

#### Functional requirements
- Combo is treated as a product-like entity, but operationally composed of other products.
- Combo shall contain component products and required quantities.
- Only non-combo products can be used as combo components.
- Admin shall create, edit, activate/deactivate, and delete combos.
- Admin shall import combos from Excel.
- The system shall compute combo stock virtually from its components.
- Combo shall not be stocked directly through normal stock receipt.

#### Business meaning
A combo is a commercial bundle:
- sold as one offer,
- stocked indirectly,
- costed as the sum of components,
- fulfilled by decrementing component stock.

### 4.9 Suppliers

#### Functional requirements
- Admin shall create, update, search, and deactivate suppliers.
- Supplier data includes:
  - code
  - name
  - phone
  - address
  - tax code
  - email
  - note
  - active status
- Supplier can be created inline during stock receipt flows.

#### Business meaning
Supplier records support procurement traceability and faster goods receiving.

### 4.10 Customers

#### Functional requirements
- Admin shall create, update, search, and deactivate customers.
- Customer data includes:
  - code
  - name
  - phone
  - address
  - email
  - group
  - note
  - active status
- Customer groups include:
  - Retail
  - Wholesale
  - VIP
- Admin shall view purchase history for each customer.
- Customer can be created inline during invoice creation.

#### Business meaning
The customer module supports:
- CRM-lite
- spend tracking
- segmentation
- repeat purchase visibility

### 4.11 Goods Receipt / Stock In

#### Functional requirements
- Admin shall create stock receipt records manually.
- Admin shall import stock receipts from Excel.
- Receipt supports:
  - receipt date
  - supplier
  - note
  - shipping fee
  - VAT %
  - item lines
- Receipt line supports:
  - product
  - variant
  - quantity
  - unit cost
  - discount %
  - import unit
  - pieces override
  - expiry date override
- Receipt may also include combo-related stock cost allocation logic.
- Shipping and VAT are included in final cost calculations.
- Admin may edit receipt metadata only:
  - note
  - supplier
  - receipt date
- Admin may delete receipt only when stock from that receipt has not already been sold.
- After successful receipt creation, admin may print barcode labels.

#### Business meaning
The receipt workflow is not just for quantity increase. It also establishes:
- landed cost,
- lot/expiry context,
- traceability to supplier,
- downstream FEFO valuation.

### 4.12 Sales Invoices / POS

#### Functional requirements
- Admin shall create invoices manually.
- Invoice shall support:
  - customer selection or guest sale
  - inline customer creation
  - note
  - multiple product lines
  - variant selection
  - line discount %
  - promotion selection
  - barcode scan entry
- Admin shall view invoice detail.
- Admin shall print invoice.
- Admin shall cancel invoice with reason.
- Admin shall delete invoice only if it belongs to the same day.
- Cancelled invoices remain in history.

#### Business meaning
The invoice page functions as a POS/sales control screen with:
- rapid line entry,
- stock-aware selling,
- barcode-assisted checkout,
- audit trail for cancellations.

### 4.13 Promotions

#### Functional requirements
- Admin shall create, edit, activate/deactivate, and delete promotions.
- Promotion types supported by UI:
  - percent discount
  - fixed discount
  - buy X get Y
  - quantity gift
  - free shipping
- Promotion shall define:
  - name
  - description
  - active status
  - start date/time
  - end date/time
  - minimum order value
  - optional maximum discount
  - scope:
    - all products
    - specific categories
    - specific products

#### Business meaning
Promotions are designed as reusable business rules for:
- order-level incentive programs
- product/category targeting
- campaign scheduling

### 4.14 Inventory Reporting

#### Functional requirements
- Admin shall view inventory position for a date range.
- Report shall show:
  - opening stock
  - received quantity
  - sold quantity
  - closing stock
  - closing stock value
- Report shall support search and Excel export.
- Report is variant-oriented.

#### Business meaning
Inventory reporting is intended for stock control and stock value monitoring, not just item counting.

### 4.15 Profit Reporting

#### Functional requirements
- Admin shall view profit by:
  - this week
  - this month
  - weekly breakdown
  - monthly breakdown
  - custom date range
- Report shall show:
  - revenue
  - cost
  - profit
  - margin %
  - invoice count
- Report shall support export.

#### Business meaning
Profit reporting is focused on margin control and management accounting.

### 4.16 Revenue Reporting

#### Functional requirements
- Admin shall view revenue:
  - total
  - by product
  - by category
  - top-selling variants
  - slow-moving variants
- Report shall support period grouping:
  - daily
  - weekly
  - monthly
  - yearly
- Report shall support export for main revenue views.

#### Business meaning
Revenue reporting serves both:
- management insight,
- merchandising decisions,
- and replenishment/clearance actions.

### 4.17 Stock Adjustment / Stocktake

#### Functional requirements
- Admin shall create stock adjustment documents in `DRAFT`.
- Adjustment requires:
  - reason
  - note
  - item lines by variant
  - system quantity
  - actual quantity
  - line note
- Admin shall confirm a draft adjustment.
- Only confirmed adjustment changes stock.
- Admin shall delete draft adjustments.

#### Business meaning
This is a controlled reconciliation process for:
- stocktake differences,
- damage,
- expiry write-off,
- loss,
- other corrections.

### 4.18 Barcode Scanning and Barcode Labels

#### Functional requirements
- Barcode scanning shall support:
  - HID scanner
  - camera scanner
  - manual code entry
- Scanning shall match first by variant code, then by product code/barcode.
- Barcode labels shall support:
  - product code barcode
  - product name
  - category
  - receipt date / receipt number
  - sell price
  - configurable number of labels to print

#### Business meaning
Barcode handling is meant to accelerate:
- selling,
- receiving,
- shelf labeling,
- and product identification accuracy.

## 5. User Flows / Use Cases

### 5.1 Customer registration flow
1. User opens signup page.
2. User enters username, optional full name, password, confirm password.
3. System creates account.
4. System immediately initiates TOTP setup.
5. User scans QR code or enters secret manually.
6. User enters 6-digit OTP.
7. Account becomes usable only after successful TOTP enablement.

### 5.2 Storefront cash order flow
1. User browses products/combos.
2. Adds variants/combos to cart.
3. Logs in if not authenticated.
4. Selects/enters customer info.
5. Optionally selects promotion.
6. System checks stock availability.
7. User chooses cash.
8. System creates invoice immediately.
9. Order success modal allows invoice printing.

### 5.3 Storefront online payment flow
1. User builds cart and checks out.
2. User selects transfer/MoMo/ZaloPay.
3. System checks stock availability.
4. System creates pending order.
5. User sees payment instructions and expiry countdown.
6. Admin reviews and confirms receipt of funds.
7. System converts pending order to invoice and deducts stock.

### 5.4 Admin goods receipt flow
1. Admin starts receipt creation.
2. Selects/creates supplier.
3. Sets receipt date, shipping fee, VAT, note.
4. Adds product/variant lines with costs and expiry info.
5. System calculates total cost.
6. Admin saves receipt.
7. System updates stock/cost basis.
8. Admin may print barcode labels.

### 5.5 Invoice cancellation flow
1. Admin opens active invoice.
2. Admin selects cancel.
3. Optionally enters cancel reason.
4. System marks invoice cancelled.
5. System restores stock.
6. Invoice remains visible for audit/history.

### 5.6 Stocktake adjustment flow
1. Admin creates adjustment draft.
2. Searches/selects variants.
3. Inputs actual counted quantities.
4. Reviews differences.
5. Saves draft.
6. Confirms adjustment later.
7. System updates stock at confirmation time.

## 6. Business Rules

### 6.1 Security and access
- New user registration requires TOTP setup before normal use.
- Admin features are restricted to admin users only.
- Expired session should force re-login.

### 6.2 Selling rules
- Customers may browse without login, but checkout requires login.
- Cash checkout creates invoice immediately.
- Online payment methods create pending order first.
- Admin confirmation is required before an online payment becomes a finalized invoice.

### 6.3 Inventory rules
- Variant is the operational stock unit.
- Stock is checked before invoice/order submission.
- Pending online orders reduce effective availability indirectly through reservation logic.
- Receipt deletion is blocked once any related stock has already been sold.
- Invoice cancellation restores stock.
- Invoice deletion also restores stock, but is limited to same-day invoices.
- Stock adjustment only affects stock after confirmation.

### 6.4 Product rules
- Category must be selected before product code generation/use.
- Single products can have variants.
- Combo products do not carry direct stock.
- Combo stock is derived from components.
- Combo cannot contain another combo.
- Only one default variant should exist per product.

### 6.5 Costing / procurement rules
- Shipping fee and VAT contribute to receipt total and implied cost allocation.
- Discount at receipt line level reduces net procurement cost.
- Expiry-aware handling suggests FEFO-based inventory consumption/costing.

### 6.6 Promotion rules
- Promotions are time-bound and can be activated/deactivated.
- Promotions can apply globally, by category, or by product.
- Some promotions require minimum order value.
- Percentage discounts may have maximum discount caps.

### 6.7 Customer and supplier lifecycle
- Customer “delete” behavior is business deactivation, not hard deletion.
- Supplier “delete” behavior is business deactivation, not hard deletion.

### 6.8 Date/time rule
- Business dates are treated as Vietnam local time (reinforced by attached backend timezone initialization to `Asia/Ho_Chi_Minh`).

## 7. Validation Rules

### 7.1 Authentication
- Username required for login/signup.
- Password required for login.
- Signup username minimum length: 3.
- Signup password minimum length: 6.
- Confirm password must match.
- OTP must be exactly 6 digits for login/signup/security operations.

### 7.2 Product and variant
- Product code cannot be blank.
- Variant code cannot be blank.
- Variant name cannot be blank.
- Sell unit cannot be blank.
- Sell price cannot be negative.
- Cost price cannot be negative.
- Expiry days is mandatory and must be > 0.
- Numeric inputs are sanitized to numeric-only in many places.
- Some prices are warned if not multiples of 1,000 VND.

### 7.3 Receipt
- Receipt must contain at least one product or combo line.
- If a selected variant has no configured expiry days, user must provide an expiry date override.
- Receipt date cannot be in the future.
- Excel import only accepts `.xlsx`.

### 7.4 Invoice / checkout
- Invoice/order must contain at least one line.
- Quantity must be positive.
- Quantity cannot exceed available stock.
- Checkout cannot proceed when stock conflicts exist.
- Promotion preview only applies when order minimum is met.

### 7.5 Customers and suppliers
- Customer code required.
- Customer name required.
- Supplier code required.
- Supplier name required.
- Email fields use email input type.
- Duplicate phone for inline customer creation is treated as an error.

### 7.6 Reports
- Inventory report end date cannot exceed today.
- Inventory report end date cannot be earlier than start date.

## 8. UI-Driven Constraints

- Storefront is public, but purchasing is gated by authentication.
- Mobile-first navigation exists for both storefront and admin.
- Pending order monitoring is polling-based, implying near-real-time status updates rather than push notifications.
- Admin notification count for pending orders is visible in navigation.
- Receipt metadata is editable after creation, but financial/stock-driving lines are not.
- Barcode camera mode requires HTTPS or localhost; HID/manual input is fallback.
- Excel imports use a preview-first pattern before final commit.
- Some warnings are advisory, not blocking:
  - non-rounded price
  - near-promotion threshold
  - low stock
- Some actions are blocked by process control, not just permissions:
  - delete receipt after stock sold
  - delete invoice if not same day
  - adjust stock only after confirm

## 9. Edge Cases and Exception Handling

- Token refresh failure logs user out and redirects to login.
- Unauthorized admin API access shows permission error.
- Public storefront suppresses unnecessary permission noise for admin-only data.
- Online stock conflict returns clear warnings when stock has been reserved by others.
- Pending orders stop polling once confirmed or cancelled.
- Expired pending orders show countdown/expired state.
- If image upload infrastructure is unavailable, product image can fall back to base64/manual URL.
- Scanner supports HID/manual fallback if camera is unavailable.
- Excel import preview surfaces row-level warnings and errors before commit.
- Receipt edit explicitly avoids changing stock-impacting fields after posting.
- Daily dashboard alert is shown once per day per browser for expiry issues.

## 10. Assumptions and Need Clarification

### Assumption:
- `ROLE_USER` users are intended to be customers or non-admin staff using storefront ordering only.

### Assumption:
- Inventory consumption and valuation are FEFO/expiry-aware, because receipt and dashboard logic emphasize expiry dates and lot expiry warnings.

### Assumption:
- “Delete” for customers/suppliers/users generally means deactivate/disable, not permanent deletion.

### Assumption:
- Vietnam local business time is the intended source of truth for operational dates, supported by the attached backend timezone bootstrap.

### Need clarification:
- Cash checkout from storefront currently creates an invoice immediately, even though the payment label says “pay on delivery / when receiving goods.” Is this intended to represent:
  - immediate confirmed sale, or
  - cash-on-delivery reservation that should also wait for fulfillment?

### Need clarification:
- Non-admin access to security settings is unclear. TOTP is mandatory for all new users, but the visible security route is only under admin routing. Should regular users be able to manage 2FA after registration?

### Need clarification:
- Promotion types `FREE_SHIPPING`, `BUY_X_GET_Y`, and `QUANTITY_GIFT` are configurable in admin UI, but storefront/invoice preview mainly calculates percent/fixed discounts. Is the backend expected to fully apply these rules even when the UI only partially previews them?

### Need clarification:
- In manual receipt creation, supplier appears optional; in Excel import, supplier name/selection is effectively required. Should supplier be mandatory for all stock receipts?

### Need clarification:
- Receipt Excel import UI still references combo support in places, but current preview/import behavior appears primarily oriented to single-product sheet processing. Is combo receipt import officially supported or temporarily disabled?

### Need clarification:
- Barcode label printing uses product code-based labels; for multi-variant items, should labels print:
  - product code, or
  - variant code?

### Need clarification:
- Customer grouping (`RETAIL`, `WHOLESALE`, `VIP`) is visible, but no pricing/discount behavior tied to group is present in the UI. Are groups informational only, or should they drive pricing/promotion rules?

## 11. Summary

`NhaDanShopUI` represents a retail management solution centered on:

- secure user access,
- variant-level stock control,
- manual confirmation of online payments,
- expiry-sensitive procurement and stock monitoring,
- POS-style invoicing,
- promotional campaign management,
- and operational reporting.

The strongest business themes visible in the UI are:

1. Operational control over stock and expiry
2. Manual trust/control for non-cash payments
3. Variant-based selling and procurement
4. Auditability through non-destructive cancellation/deactivation
5. Security-first onboarding via mandatory TOTP

