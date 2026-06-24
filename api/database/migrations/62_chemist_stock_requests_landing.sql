-- Ensure external chemist users can find Stock Requests in menu and landing quick links.

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/stock-requests', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

UPDATE roles
SET landingQuickLinks = JSON_ARRAY(
    JSON_OBJECT('label', 'Current Referrals', 'url', '/chemist/referrals', 'icon', 'Store'),
    JSON_OBJECT('label', 'Drug Availability', 'url', '/chemist/drugs', 'icon', 'Package'),
    JSON_OBJECT('label', 'Stock Requests', 'url', '/chemist/stock-requests', 'icon', 'Truck'),
    JSON_OBJECT('label', 'Available Labs', 'url', '/chemist/labs', 'icon', 'FlaskConical'),
    JSON_OBJECT('label', 'Pickup History', 'url', '/chemist/history', 'icon', 'History'),
    JSON_OBJECT('label', 'Chemist Profile', 'url', '/chemist/profile', 'icon', 'MapPin'),
    JSON_OBJECT('label', 'Chemist Users', 'url', '/chemist/users', 'icon', 'UserCog')
),
    updatedAt = NOW()
WHERE roleName = 'chemist';
