-- Drug movement: inter-store transfers and external chemist stock supply requests.
-- Run after 57_branch_multi_tenancy_phase1.sql.

CREATE TABLE IF NOT EXISTS external_chemist_stock_requests (
    requestId INT NOT NULL AUTO_INCREMENT,
    requestNumber VARCHAR(50) NOT NULL,
    chemistId INT NOT NULL,
    sourceStoreId INT NOT NULL,
    status ENUM('pending', 'approved', 'dispatched', 'received', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
    requestDate DATE NOT NULL,
    requestedBy INT NULL,
    processedBy INT NULL,
    dispatchedBy INT NULL,
    receivedBy INT NULL,
    dispatchedAt DATETIME NULL,
    receivedAt DATETIME NULL,
    notes TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (requestId),
    UNIQUE KEY uniq_external_chemist_stock_request_number (requestNumber),
    INDEX idx_external_chemist_stock_requests_chemist (chemistId),
    INDEX idx_external_chemist_stock_requests_store (sourceStoreId),
    INDEX idx_external_chemist_stock_requests_status (status),
    INDEX idx_external_chemist_stock_requests_date (requestDate),
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE RESTRICT,
    FOREIGN KEY (sourceStoreId) REFERENCES drug_stores(storeId) ON DELETE RESTRICT,
    FOREIGN KEY (requestedBy) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (processedBy) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (dispatchedBy) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (receivedBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_chemist_stock_request_items (
    requestItemId INT NOT NULL AUTO_INCREMENT,
    requestId INT NOT NULL,
    medicationId INT NOT NULL,
    medicationName VARCHAR(255) NULL,
    quantityRequested INT NOT NULL,
    quantityDispatched INT NOT NULL DEFAULT 0,
    quantityReceived INT NOT NULL DEFAULT 0,
    drugInventoryId INT NULL,
    batchNumber VARCHAR(100) NULL,
    unitPrice DECIMAL(12, 2) NULL,
    sellPrice DECIMAL(12, 2) NULL,
    expiryDate DATE NULL,
    chemistDrugId INT NULL,
    notes TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (requestItemId),
    INDEX idx_external_chemist_stock_request_items_request (requestId),
    INDEX idx_external_chemist_stock_request_items_medication (medicationId),
    FOREIGN KEY (requestId) REFERENCES external_chemist_stock_requests(requestId) ON DELETE CASCADE,
    FOREIGN KEY (medicationId) REFERENCES medications(medicationId) ON DELETE RESTRICT,
    FOREIGN KEY (drugInventoryId) REFERENCES drug_inventory(drugInventoryId) ON DELETE SET NULL,
    FOREIGN KEY (chemistDrugId) REFERENCES external_chemist_drug_availability(chemistDrugId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Allow supply_dispatch movement type for hospital-to-chemist stock transfers.
ALTER TABLE external_chemist_stock_movements
    MODIFY COLUMN movementType ENUM(
        'initial',
        'adjustment_in',
        'adjustment_out',
        'import',
        'referral_pickup',
        'supply_dispatch',
        'correction',
        'remove'
    ) NOT NULL;

-- Chemist role menu access for stock requests
INSERT INTO role_menu_items (roleId, categoryId, menuItemPath, isAllowed)
SELECT roleId, 'clinical-services', '/chemist/stock-requests', TRUE FROM roles WHERE roleName = 'chemist'
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();

-- Pharmacy staff access to drug movement tab
INSERT INTO role_page_tabs (roleId, pagePath, tabId, isAllowed)
SELECT roleId, '/pharmacy', 'drug-movement', TRUE FROM roles WHERE roleName IN ('admin', 'pharmacist', 'pharmacy')
ON DUPLICATE KEY UPDATE isAllowed = VALUES(isAllowed), updatedAt = NOW();
