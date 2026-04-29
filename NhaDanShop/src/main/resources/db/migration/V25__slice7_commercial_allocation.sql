-- Slice 7: KiotViet-like line-level commercial allocation (nullable for legacy rows)
ALTER TABLE sales_invoice_items ADD COLUMN line_gross_amount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN line_own_discount_amount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN line_net_before_invoice_discount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN allocated_manual_discount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN allocated_promotion_discount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN allocated_voucher_discount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN allocated_merchandise_discount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN line_net_revenue DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN line_vat_base DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN line_vat_amount DECIMAL(18, 2);
ALTER TABLE sales_invoice_items ADD COLUMN commercial_allocation_version INT;

ALTER TABLE pending_order_items ADD COLUMN line_gross_amount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN line_own_discount_amount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN line_net_before_invoice_discount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN allocated_manual_discount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN allocated_promotion_discount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN allocated_voucher_discount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN allocated_merchandise_discount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN line_net_revenue DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN line_vat_base DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN line_vat_amount DECIMAL(18, 2);
ALTER TABLE pending_order_items ADD COLUMN commercial_allocation_version INT;

