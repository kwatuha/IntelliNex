-- Telemedicine-focused experience pack (role configuration).
-- Assign users who should see a telemedicine-centric product surface
-- (not the full HMIS) to roleName = telemedicine_clinician.
-- Full-app users keep their existing broad roles (legacy unconfigured menus = show all).

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
    'Start and manage remote video visits. Use quick links for patients, triage, and the telemedicine queue.',
    'telemedicine',
    JSON_ARRAY(
        JSON_OBJECT('label', 'Telemedicine', 'url', '/telemedicine', 'icon', 'Video'),
        JSON_OBJECT('label', 'Queue', 'url', '/queue', 'icon', 'ListOrdered'),
        JSON_OBJECT('label', 'Patients', 'url', '/patients', 'icon', 'Users'),
        JSON_OBJECT('label', 'Triaging', 'url', '/triaging', 'icon', 'Activity'),
        JSON_OBJECT('label', 'Appointments', 'url', '/appointments', 'icon', 'Calendar'),
        JSON_OBJECT('label', 'Medical Records', 'url', '/medical-records', 'icon', 'FileText')
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

-- Category allow-list: patient care + clinical only
INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'overview', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'patient-care', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'clinical-services', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'financial', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'procurement', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'administrative', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Patient Care: allow focused paths only (explicit rows so other items stay hidden)
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'patient-care', '/patients', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'patient-care', '/triaging', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'patient-care', '/appointments', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'patient-care', '/queue', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'patient-care', '/medical-records', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Clinical Services: telemedicine only
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/telemedicine', TRUE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/doctors', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/pharmacy', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/laboratory', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/radiology', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/inpatient', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/maternity', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/icu', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/ambulance', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/field-datasets', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/field-app', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/field-app-usage', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/procedures/performed', FALSE FROM roles WHERE roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Queue: telemedicine + supporting points only (empty allow-list would mean “all queues”)
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
WHERE r.roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Privileges: mirror doctor when that role exists
INSERT INTO role_privileges (roleId, privilegeId)
SELECT tc.roleId, rp.privilegeId
FROM roles tc
INNER JOIN roles d ON d.roleName = 'doctor'
INNER JOIN role_privileges rp ON rp.roleId = d.roleId
WHERE tc.roleName = 'telemedicine_clinician'
ON DUPLICATE KEY UPDATE roleId = VALUES(roleId);
