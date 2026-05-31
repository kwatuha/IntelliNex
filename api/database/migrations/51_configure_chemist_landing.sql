-- Configure the external chemist role as a restricted workbench user.
-- Without explicit role_menu rows, the UI treats legacy roles as permissive and shows all modules.

CREATE TABLE IF NOT EXISTS role_menu_categories (
    roleId INT NOT NULL,
    categoryId VARCHAR(50) NOT NULL,
    isAllowed BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (roleId, categoryId),
    FOREIGN KEY (roleId) REFERENCES roles(roleId) ON DELETE CASCADE,
    INDEX idx_role (roleId),
    INDEX idx_category (categoryId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_menu_items (
    roleId INT NOT NULL,
    categoryId VARCHAR(50) NOT NULL,
    menuItemPath VARCHAR(255) NOT NULL,
    isAllowed BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (roleId, categoryId, menuItemPath),
    FOREIGN KEY (roleId) REFERENCES roles(roleId) ON DELETE CASCADE,
    INDEX idx_role (roleId),
    INDEX idx_path (menuItemPath),
    INDEX idx_category_path (categoryId, menuItemPath)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_page_tabs (
    roleId INT NOT NULL,
    pagePath VARCHAR(255) NOT NULL,
    tabId VARCHAR(100) NOT NULL,
    isAllowed BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (roleId, pagePath, tabId),
    FOREIGN KEY (roleId) REFERENCES roles(roleId) ON DELETE CASCADE,
    INDEX idx_role (roleId),
    INDEX idx_page (pagePath),
    INDEX idx_tab (tabId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (
    roleName,
    description,
    isActive,
    landingPageType,
    landingPageLabel,
    landingPageUrl,
    landingPageIcon,
    landingPageDescription,
    landingQuickLinks
)
VALUES (
    'chemist',
    'External chemist/pharmacy partner with access to referred prescriptions',
    TRUE,
    'redirect',
    'Chemist Referrals',
    '/chemist/referrals',
    'Store',
    'Review referred patients and record medication pickup status.',
    JSON_ARRAY(
        JSON_OBJECT('label', 'Current Referrals', 'url', '/chemist/referrals', 'icon', 'Store'),
        JSON_OBJECT('label', 'Drug Availability', 'url', '/chemist/drugs', 'icon', 'Package'),
        JSON_OBJECT('label', 'Available Labs', 'url', '/chemist/labs', 'icon', 'FlaskConical'),
        JSON_OBJECT('label', 'Pickup History', 'url', '/chemist/history', 'icon', 'History'),
        JSON_OBJECT('label', 'Chemist Profile', 'url', '/chemist/profile', 'icon', 'MapPin'),
        JSON_OBJECT('label', 'Chemist Users', 'url', '/chemist/users', 'icon', 'UserCog')
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
    landingQuickLinks = VALUES(landingQuickLinks);

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'overview', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'patient-care', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'clinical-services', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'financial', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'procurement', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_categories (roleId, categoryId, isAllowed)
SELECT roleId, 'administrative', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Mark all known clinical menu items denied, then allow only the chemist workbench.
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/doctors', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/pharmacy', FALSE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/referrals', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/drugs', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/labs', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/history', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/profile', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/users', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

INSERT INTO role_page_tabs (roleId, pagePath, tabId, isAllowed)
SELECT roleId, '/chemist/referrals', 'referrals', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();
