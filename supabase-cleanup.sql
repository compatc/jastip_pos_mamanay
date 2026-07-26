-- ============================================
-- REMOVE DUPLICATE DATA (safe order)
-- Run this in Supabase SQL Editor
-- ============================================

-- Delete dependents first (order_items references orders)
DELETE FROM order_items WHERE id NOT IN (
  SELECT DISTINCT ON (order_id, product_name, quantity) id FROM order_items ORDER BY order_id, product_name, quantity, id
);

-- Orders references customers
DELETE FROM orders WHERE id NOT IN (
  SELECT DISTINCT ON (customer_id, created_at, total) id FROM orders ORDER BY customer_id, created_at, total, id
);

-- Stock movements references products
DELETE FROM stock_movements WHERE id NOT IN (
  SELECT DISTINCT ON (product_id, date, invoice_no, party_name, qty) id FROM stock_movements ORDER BY product_id, date, invoice_no, party_name, qty, id
);

-- Now safe to delete customers and products
DELETE FROM customers WHERE id NOT IN (
  SELECT DISTINCT ON (name, phone, category) id FROM customers ORDER BY name, phone, category, id
);

DELETE FROM products WHERE id NOT IN (
  SELECT DISTINCT ON (name) id FROM products ORDER BY name, id
);

-- Verify
SELECT 'customers' as tbl, COUNT(*) as cnt FROM customers
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements;
