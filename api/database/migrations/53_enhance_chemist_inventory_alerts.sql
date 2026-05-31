-- Enhancements for external chemist stock management and demand alerts.

DELIMITER //

CREATE PROCEDURE add_external_chemist_drug_column_if_missing(
    IN p_column_name VARCHAR(64),
    IN p_column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'external_chemist_drug_availability'
          AND COLUMN_NAME = p_column_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE external_chemist_drug_availability ADD COLUMN ', p_column_name, ' ', p_column_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//

DELIMITER ;

CALL add_external_chemist_drug_column_if_missing('brandName', 'VARCHAR(255) NULL AFTER medicationName');
CALL add_external_chemist_drug_column_if_missing('packSize', 'VARCHAR(100) NULL AFTER dosageForm');
CALL add_external_chemist_drug_column_if_missing('minimumStockLevel', 'INT DEFAULT 0 AFTER quantityAvailable');
CALL add_external_chemist_drug_column_if_missing('restockEta', 'DATE NULL AFTER expiryDate');
CALL add_external_chemist_drug_column_if_missing('supplierName', 'VARCHAR(200) NULL AFTER restockEta');
CALL add_external_chemist_drug_column_if_missing('lastImportedAt', 'DATETIME NULL AFTER supplierName');

DROP PROCEDURE add_external_chemist_drug_column_if_missing;

CREATE TABLE IF NOT EXISTS external_chemist_stock_alerts (
    alertId INT NOT NULL AUTO_INCREMENT,
    chemistId INT NOT NULL,
    medicationId INT NULL,
    medicationKey VARCHAR(255) NOT NULL,
    medicationName VARCHAR(255) NOT NULL,
    alertType ENUM('not_listed', 'out_of_stock', 'stale', 'low_stock') NOT NULL,
    requestCount INT DEFAULT 1,
    lastPrescriptionId INT NULL,
    lastReferralId INT NULL,
    lastRequestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('open', 'resolved', 'dismissed') DEFAULT 'open',
    restockEta DATE NULL,
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (alertId),
    UNIQUE KEY uniq_external_chemist_stock_alert (chemistId, medicationKey, alertType, status),
    INDEX idx_external_chemist_stock_alerts_chemist (chemistId),
    INDEX idx_external_chemist_stock_alerts_status (status),
    INDEX idx_external_chemist_stock_alerts_type (alertType),
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE CASCADE,
    FOREIGN KEY (medicationId) REFERENCES medications(medicationId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
