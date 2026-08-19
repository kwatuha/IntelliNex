-- Telemedicine showcase pack (role-level mirror of lib/telemedicine-scope.ts).
-- Hides scoped-down modules for clinical roles. Source of truth for nav + URL
-- guard is NEXT_PUBLIC_EXPERIENCE_PACK=telemedicine + lib/telemedicine-scope.ts
-- (status: scoped_down | active). Flip status there to restore in a later POC.
--
-- Scoped down for this POC:
--   categories: procurement, financial
--   paths: /hr/employees, /chemist/*, /radiology, /laboratory,
--          /inpatient, /maternity, /icu, /ambulance
--
-- Applied by: npm run migrate:telemedicine-showcase

INSERT INTO roles (
    roleName,
    description,
    isActive,
    landingPageType,
    landingPageLabel,
    landingPageUrl,
    landingPageIcon,
    landingPageDescription,
    defaultServicePoint,
    landingQuickLinks
)
VALUES (
    'telemedicine_clinician',
    'Telemedicine-focused clinician: remote visits, patients, triage, and queue — without full HMIS modules',
    TRUE,
    'redirect',
    'Telemedicine',
    '/telemedicine',
    'Video',
    'Start and manage remote video visits.',
    'telemedicine',
    JSON_ARRAY(
        JSON_OBJECT('label', 'Telemedicine', 'url', '/telemedicine', 'icon', 'Video'),
        JSON_OBJECT('label', 'Queue', 'url', '/queue', 'icon', 'ListOrdered'),
        JSON_OBJECT('label', 'Patients', 'url', '/patients', 'icon', 'Users'),
        JSON_OBJECT('label', 'Appointments', 'url', '/appointments', 'icon', 'Calendar')
    )
)
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    isActive = TRUE,
    landingPageType = VALUES(landingPageType),
    landingPageLabel = VALUES(landingPageLabel),
    landingPageUrl = VALUES(landingPageUrl),
    landingPageIcon = VALUES(landingPageIcon),
    landingPageDescription = VALUES(landingPageDescription),
    defaultServicePoint = VALUES(defaultServicePoint),
    landingQuickLinks = VALUES(landingQuickLinks);

-- Landing → telemedicine for clinical / front-desk roles (not admin)
UPDATE roles r
SET
    landingPageType = 'redirect',
    landingPageLabel = 'Telemedicine',
    landingPageUrl = '/telemedicine',
    landingPageIcon = 'Video',
    landingPageDescription = 'Telemedicine showcase — remote visits first.',
    defaultServicePoint = COALESCE(NULLIF(defaultServicePoint, ''), 'telemedicine'),
    landingQuickLinks = JSON_ARRAY(
        JSON_OBJECT('label', 'Telemedicine', 'url', '/telemedicine', 'icon', 'Video'),
        JSON_OBJECT('label', 'Queue', 'url', '/queue', 'icon', 'ListOrdered'),
        JSON_OBJECT('label', 'Patients', 'url', '/patients', 'icon', 'Users'),
        JSON_OBJECT('label', 'Appointments', 'url', '/appointments', 'icon', 'Calendar'),
        JSON_OBJECT('label', 'Triaging', 'url', '/triaging', 'icon', 'Activity'),
        JSON_OBJECT('label', 'Medical Records', 'url', '/medical-records', 'icon', 'FileText')
    )
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician'
)
  AND LOWER(r.roleName) NOT LIKE 'super%'
  AND LOWER(r.roleName) NOT LIKE 'system%'
  AND LOWER(r.roleName) <> 'admin';

-- Categories: hide procurement + financial; keep patient-care + clinical (+ admin for admin role only via pack filter)
INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT r.roleId, c.categoryId, c.isAllowed
FROM roles r
CROSS JOIN (
    SELECT 'overview' AS categoryId, TRUE AS isAllowed
    UNION ALL SELECT 'patient-care', TRUE
    UNION ALL SELECT 'clinical-services', TRUE
    UNION ALL SELECT 'financial', FALSE
    UNION ALL SELECT 'procurement', FALSE
    UNION ALL SELECT 'administrative', TRUE
) c
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician', 'admin'
)
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Patient-care allow-list
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT r.roleId, i.categoryId, i.menuItemPath, i.isAllowed
FROM roles r
CROSS JOIN (
    SELECT 'patient-care' AS categoryId, '/patients' AS menuItemPath, TRUE AS isAllowed
    UNION ALL SELECT 'patient-care', '/triaging', TRUE
    UNION ALL SELECT 'patient-care', '/appointments', TRUE
    UNION ALL SELECT 'patient-care', '/queue', TRUE
    UNION ALL SELECT 'patient-care', '/medical-records', TRUE
) i
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician', 'admin'
)
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Clinical: telemedicine + pharmacy/doctors optional; hide scoped-down wards/diagnostics/chemist
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT r.roleId, i.categoryId, i.menuItemPath, i.isAllowed
FROM roles r
CROSS JOIN (
    SELECT 'clinical-services' AS categoryId, '/telemedicine' AS menuItemPath, TRUE AS isAllowed
    UNION ALL SELECT 'clinical-services', '/doctors', TRUE
    UNION ALL SELECT 'clinical-services', '/pharmacy', TRUE
    -- scoped_down (lib/telemedicine-scope.ts) — restore by setting status active + allow TRUE here
    UNION ALL SELECT 'clinical-services', '/chemist/referrals', FALSE
    UNION ALL SELECT 'clinical-services', '/chemist/drugs', FALSE
    UNION ALL SELECT 'clinical-services', '/chemist/stock-requests', FALSE
    UNION ALL SELECT 'clinical-services', '/chemist/labs', FALSE
    UNION ALL SELECT 'clinical-services', '/chemist/history', FALSE
    UNION ALL SELECT 'clinical-services', '/chemist/profile', FALSE
    UNION ALL SELECT 'clinical-services', '/chemist/users', FALSE
    UNION ALL SELECT 'clinical-services', '/laboratory', FALSE
    UNION ALL SELECT 'clinical-services', '/radiology', FALSE
    UNION ALL SELECT 'clinical-services', '/inpatient', FALSE
    UNION ALL SELECT 'clinical-services', '/maternity', FALSE
    UNION ALL SELECT 'clinical-services', '/icu', FALSE
    UNION ALL SELECT 'clinical-services', '/ambulance', FALSE
    UNION ALL SELECT 'clinical-services', '/field-datasets', FALSE
    UNION ALL SELECT 'clinical-services', '/field-app', FALSE
    UNION ALL SELECT 'clinical-services', '/field-app-usage', FALSE
    UNION ALL SELECT 'clinical-services', '/procedures/performed', FALSE
) i
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician', 'admin'
)
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Administrative: hide HR employees; keep system admin / settings for admin role
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT r.roleId, i.categoryId, i.menuItemPath, i.isAllowed
FROM roles r
CROSS JOIN (
    SELECT 'administrative' AS categoryId, '/hr/employees' AS menuItemPath, FALSE AS isAllowed
    UNION ALL SELECT 'administrative', '/administration', TRUE
    UNION ALL SELECT 'administrative', '/settings', TRUE
    UNION ALL SELECT 'administrative', '/configuration', TRUE
    UNION ALL SELECT 'administrative', '/reports', TRUE
) i
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician', 'admin'
)
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Explicit deny for procurement + financial paths (category already false; rows aid restore docs)
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT r.roleId, i.categoryId, i.menuItemPath, FALSE
FROM roles r
CROSS JOIN (
    SELECT 'procurement' AS categoryId, '/procurement/vendors' AS menuItemPath
    UNION ALL SELECT 'procurement', '/procurement/orders'
    UNION ALL SELECT 'procurement', '/inventory'
    UNION ALL SELECT 'financial', '/finance/accounts'
    UNION ALL SELECT 'financial', '/finance/statements'
    UNION ALL SELECT 'financial', '/billing'
    UNION ALL SELECT 'financial', '/insurance'
) i
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician', 'admin'
)
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Queue access: telemedicine + supporting points
INSERT INTO role_queue_access (roleId, servicePoint, isAllowed)
SELECT r.roleId, sp.servicePoint, sp.isAllowed
FROM roles r
CROSS JOIN (
    SELECT 'telemedicine' AS servicePoint, TRUE AS isAllowed
    UNION ALL SELECT 'triage', TRUE
    UNION ALL SELECT 'consultation', TRUE
    UNION ALL SELECT 'registration', TRUE
    UNION ALL SELECT 'laboratory', FALSE
    UNION ALL SELECT 'radiology', FALSE
    UNION ALL SELECT 'pharmacy', FALSE
    UNION ALL SELECT 'billing', FALSE
    UNION ALL SELECT 'cashier', FALSE
    UNION ALL SELECT 'procedure', FALSE
) sp
WHERE LOWER(r.roleName) IN (
    'doctor', 'nurse', 'receptionist', 'registration',
    'clinical_officer', 'medical_officer', 'telemedicine_clinician',
    'telemedicine clinician', 'admin'
)
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();
