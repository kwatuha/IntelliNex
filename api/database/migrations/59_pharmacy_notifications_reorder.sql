-- Pharmacy in-app notifications and reorder alert support.
-- Run after 58_drug_movement.sql.

CREATE TABLE IF NOT EXISTS pharmacy_notifications (
    notificationId INT NOT NULL AUTO_INCREMENT,
    notificationType ENUM(
        'chemist_stock_request',
        'chemist_supply_dispatched',
        'low_store_stock',
        'store_transfer'
    ) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    status ENUM('pending', 'acknowledged', 'resolved') NOT NULL DEFAULT 'pending',
    targetUserId INT NULL,
    targetRole VARCHAR(50) NULL,
    targetChemistId INT NULL,
    storeId INT NULL,
    medicationId INT NULL,
    referenceType VARCHAR(50) NULL,
    referenceId INT NULL,
    emailSentAt DATETIME NULL,
    acknowledgedBy INT NULL,
    acknowledgedAt DATETIME NULL,
    resolvedAt DATETIME NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (notificationId),
    INDEX idx_pharmacy_notifications_type (notificationType),
    INDEX idx_pharmacy_notifications_status (status),
    INDEX idx_pharmacy_notifications_target_user (targetUserId),
    INDEX idx_pharmacy_notifications_target_role (targetRole),
    INDEX idx_pharmacy_notifications_target_chemist (targetChemistId),
    INDEX idx_pharmacy_notifications_store (storeId),
    INDEX idx_pharmacy_notifications_reference (referenceType, referenceId),
    FOREIGN KEY (targetUserId) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (targetChemistId) REFERENCES external_chemists(chemistId) ON DELETE SET NULL,
    FOREIGN KEY (storeId) REFERENCES drug_stores(storeId) ON DELETE SET NULL,
    FOREIGN KEY (medicationId) REFERENCES medications(medicationId) ON DELETE SET NULL,
    FOREIGN KEY (acknowledgedBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
