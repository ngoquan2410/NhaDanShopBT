INSERT INTO roles(name, description, created_at, updated_at)
SELECT 'ROLE_STAFF', 'Staff POS role', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ROLE_STAFF');

INSERT INTO roles(name, description, created_at, updated_at)
SELECT 'ROLE_CUSTOMER', 'Customer storefront compatibility role', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ROLE_CUSTOMER');
