-- Receipt quantity is expressed in the import unit (kg, xau, thung...).
-- Retail stock remains integer and is stored separately in retail_qty_added.
ALTER TABLE inventory_receipt_items
    ALTER COLUMN quantity TYPE DECIMAL(18, 6);
