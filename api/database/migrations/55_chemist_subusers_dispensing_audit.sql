-- Chemist sub-users and referral item dispensing/completion audit fields.

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
END//

DELIMITER ;

CALL add_column_if_missing('external_chemist_users', 'createdBy', 'INT NULL AFTER isActive');
CALL add_column_if_missing('external_chemist_users', 'canManageUsers', 'BOOLEAN DEFAULT FALSE AFTER createdBy');
CALL add_column_if_missing('prescription_external_referral_items', 'dispensedBy', 'INT NULL AFTER chemistNotes');
CALL add_column_if_missing('prescription_external_referral_items', 'dispensedAt', 'DATETIME NULL AFTER dispensedBy');
CALL add_column_if_missing('prescription_external_lab_referral_items', 'completedBy', 'INT NULL AFTER chemistNotes');

DROP PROCEDURE add_column_if_missing;

CALL add_index_if_missing('external_chemist_users', 'idx_external_chemist_users_created_by', '(createdBy)');
CALL add_index_if_missing('prescription_external_referral_items', 'idx_external_referral_items_dispensed_by', '(dispensedBy)');
CALL add_index_if_missing('prescription_external_lab_referral_items', 'idx_external_lab_referral_items_completed_by', '(completedBy)');

DROP PROCEDURE add_index_if_missing;
