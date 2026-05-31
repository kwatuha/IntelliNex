-- Track external chemist stock movements and partial pickup transactions.
-- Run after 50_external_chemist_referrals.sql and 52_external_chemist_drug_availability.sql.

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
END //

CREATE PROCEDURE add_index_if_missing(
    IN p_table_name VARCHAR(64),
    IN p_index_name VARCHAR(64),
    IN p_index_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table_name
          AND INDEX_NAME = p_index_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE ', p_table_name, ' ADD INDEX ', p_index_name, ' ', p_index_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

DELIMITER ;

CALL add_column_if_missing('prescription_external_referral_items', 'chemistDrugId', 'INT NULL AFTER medicationId');
CALL add_column_if_missing('prescription_external_referral_items', 'quantityBalance', 'INT DEFAULT 0 AFTER quantityPicked');

UPDATE prescription_external_referral_items
SET quantityBalance = GREATEST(COALESCE(quantityReferred, 0) - COALESCE(quantityPicked, 0), 0)
WHERE quantityBalance IS NULL OR quantityBalance = 0;

CALL add_index_if_missing('prescription_external_referral_items', 'idx_external_referral_items_chemist_drug', '(chemistDrugId)');

DROP PROCEDURE add_index_if_missing;
DROP PROCEDURE add_column_if_missing;

CREATE TABLE IF NOT EXISTS external_chemist_stock_movements (
    movementId INT NOT NULL AUTO_INCREMENT,
    chemistDrugId INT NOT NULL,
    chemistId INT NOT NULL,
    movementType ENUM('initial', 'adjustment_in', 'adjustment_out', 'import', 'referral_pickup', 'correction', 'remove') NOT NULL,
    quantityChange INT NOT NULL,
    quantityBefore INT NOT NULL DEFAULT 0,
    quantityAfter INT NOT NULL DEFAULT 0,
    referenceType VARCHAR(50) NULL,
    referenceId INT NULL,
    referralId INT NULL,
    referralItemId INT NULL,
    actorUserId INT NULL,
    notes TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (movementId),
    INDEX idx_external_chemist_stock_movements_drug (chemistDrugId),
    INDEX idx_external_chemist_stock_movements_chemist (chemistId),
    INDEX idx_external_chemist_stock_movements_type (movementType),
    INDEX idx_external_chemist_stock_movements_referral (referralId, referralItemId),
    FOREIGN KEY (chemistDrugId) REFERENCES external_chemist_drug_availability(chemistDrugId) ON DELETE CASCADE,
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE CASCADE,
    FOREIGN KEY (referralId) REFERENCES prescription_external_referrals(referralId) ON DELETE SET NULL,
    FOREIGN KEY (referralItemId) REFERENCES prescription_external_referral_items(referralItemId) ON DELETE SET NULL,
    FOREIGN KEY (actorUserId) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_chemist_referral_pickups (
    pickupId INT NOT NULL AUTO_INCREMENT,
    referralId INT NOT NULL,
    referralItemId INT NOT NULL,
    chemistId INT NOT NULL,
    chemistDrugId INT NOT NULL,
    quantityPicked INT NOT NULL,
    cumulativeBefore INT NOT NULL DEFAULT 0,
    cumulativeAfter INT NOT NULL DEFAULT 0,
    balanceAfter INT NOT NULL DEFAULT 0,
    pickedBy INT NULL,
    pickedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pickupId),
    INDEX idx_external_chemist_referral_pickups_referral (referralId, referralItemId),
    INDEX idx_external_chemist_referral_pickups_chemist (chemistId),
    INDEX idx_external_chemist_referral_pickups_drug (chemistDrugId),
    FOREIGN KEY (referralId) REFERENCES prescription_external_referrals(referralId) ON DELETE CASCADE,
    FOREIGN KEY (referralItemId) REFERENCES prescription_external_referral_items(referralItemId) ON DELETE CASCADE,
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE CASCADE,
    FOREIGN KEY (chemistDrugId) REFERENCES external_chemist_drug_availability(chemistDrugId) ON DELETE CASCADE,
    FOREIGN KEY (pickedBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
