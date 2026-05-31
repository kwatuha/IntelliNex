-- External chemist laboratory availability and lab order referrals.

DELIMITER //

CREATE PROCEDURE add_column_if_missing(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table_name
          AND COLUMN_NAME = p_column_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE ', p_table_name, ' ADD COLUMN ', p_column_name, ' ', p_column_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//

DELIMITER ;

CALL add_column_if_missing('external_chemists', 'hasLaboratory', 'BOOLEAN DEFAULT FALSE AFTER isActive');
CALL add_column_if_missing('prescription_external_referrals', 'referralType', "ENUM('drug', 'lab') DEFAULT 'drug' AFTER referralNumber");
CALL add_column_if_missing('prescription_external_referrals', 'labOrderId', 'INT NULL AFTER prescriptionId');

DROP PROCEDURE add_column_if_missing;

ALTER TABLE prescription_external_referrals
    MODIFY prescriptionId INT NULL,
    MODIFY status ENUM('referred', 'acknowledged', 'ready_for_pickup', 'sample_collected', 'in_progress', 'partially_picked', 'picked_up', 'completed', 'not_picked', 'cancelled') DEFAULT 'referred';

CREATE TABLE IF NOT EXISTS external_chemist_lab_availability (
    chemistLabId INT NOT NULL AUTO_INCREMENT,
    chemistId INT NOT NULL,
    testTypeId INT NULL,
    testName VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    specimenType VARCHAR(100),
    turnaroundTime VARCHAR(100),
    availabilityStatus ENUM('available', 'unavailable', 'unknown') DEFAULT 'unknown',
    price DECIMAL(12, 2) NULL,
    lastConfirmedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chemistLabId),
    UNIQUE KEY uniq_external_chemist_lab_catalog (chemistId, testTypeId),
    INDEX idx_external_chemist_labs_chemist (chemistId),
    INDEX idx_external_chemist_labs_test_type (testTypeId),
    INDEX idx_external_chemist_labs_status (availabilityStatus),
    INDEX idx_external_chemist_labs_name (testName),
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE CASCADE,
    FOREIGN KEY (testTypeId) REFERENCES lab_test_types(testTypeId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prescription_external_lab_referral_items (
    referralLabItemId INT NOT NULL AUTO_INCREMENT,
    referralId INT NOT NULL,
    labOrderItemId INT NOT NULL,
    testTypeId INT NULL,
    testName VARCHAR(255) NOT NULL,
    specimenType VARCHAR(100),
    status ENUM('pending', 'sample_collected', 'in_progress', 'completed', 'not_available', 'cancelled') DEFAULT 'pending',
    externalResultSummary TEXT,
    chemistNotes TEXT,
    completedAt DATETIME NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (referralLabItemId),
    UNIQUE KEY uniq_external_lab_referral_item (referralId, labOrderItemId),
    INDEX idx_external_lab_referral_items_referral (referralId),
    INDEX idx_external_lab_referral_items_order_item (labOrderItemId),
    INDEX idx_external_lab_referral_items_status (status),
    FOREIGN KEY (referralId) REFERENCES prescription_external_referrals(referralId) ON DELETE CASCADE,
    FOREIGN KEY (labOrderItemId) REFERENCES lab_test_order_items(itemId) ON DELETE CASCADE,
    FOREIGN KEY (testTypeId) REFERENCES lab_test_types(testTypeId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
