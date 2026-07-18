-- Nurse + Triage roles: allow triage and teleconsult scheduling menus
-- Roles: 3 = nurse, 150 = Triage (adjust if your env differs)

UPDATE role_menu_categories
SET isAllowed = 1
WHERE roleId IN (3, 150)
  AND categoryId IN ('patient-care', 'clinical-services', 'overview');

UPDATE role_menu_items
SET isAllowed = 1
WHERE roleId IN (3, 150)
  AND menuItemPath IN ('/', '/triaging', '/telemedicine', '/queue', '/patients', '/appointments');

-- Ensure queue service points for triage and telemedicine
INSERT INTO role_queue_access (roleId, servicePoint, isAllowed)
SELECT r.roleId, sp.servicePoint, 1
FROM (SELECT 3 AS roleId UNION SELECT 150) r
CROSS JOIN (
  SELECT 'triage' AS servicePoint
  UNION SELECT 'telemedicine'
) sp
ON DUPLICATE KEY UPDATE isAllowed = 1;
