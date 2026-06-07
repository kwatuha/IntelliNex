-- Branch-level multi-tenancy foundation.
-- Adds user branch assignments, branch columns on operational tables, and
-- referral origin fields for external chemist/lab referrals.

INSERT INTO branches (branchCode, branchName, isMainBranch, isActive, notes)
SELECT 'MAIN', 'Main Branch', 1, 1, 'Default branch created for branch-scoped records'
WHERE NOT EXISTS (SELECT 1 FROM branches);

SET @main_branch_id := (
    SELECT branchId
    FROM branches
    WHERE isActive = 1
    ORDER BY isMainBranch DESC, branchId ASC
    LIMIT 1
);

CREATE TABLE IF NOT EXISTS user_branch_assignments (
    assignmentId INT NOT NULL AUTO_INCREMENT,
    userId INT NOT NULL,
    branchId INT NOT NULL,
    isDefault BOOLEAN DEFAULT FALSE,
    canAccessAllBranches BOOLEAN DEFAULT FALSE,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (assignmentId),
    UNIQUE KEY unique_user_branch_assignment (userId, branchId),
    INDEX idx_user_branch_assignments_user (userId),
    INDEX idx_user_branch_assignments_branch (branchId),
    INDEX idx_user_branch_assignments_default (userId, isDefault),
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE,
    FOREIGN KEY (branchId) REFERENCES branches(branchId) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO user_branch_assignments (userId, branchId, isDefault, canAccessAllBranches, isActive)
SELECT u.userId, @main_branch_id, 1,
       CASE WHEN LOWER(COALESCE(r.roleName, '')) LIKE '%admin%' THEN 1 ELSE 0 END,
       1
FROM users u
LEFT JOIN roles r ON u.roleId = r.roleId
WHERE @main_branch_id IS NOT NULL
  AND COALESCE(u.voided, 0) = 0
  AND NOT EXISTS (
      SELECT 1
      FROM user_branch_assignments uba
      WHERE uba.userId = u.userId
  );

DROP PROCEDURE IF EXISTS add_column_if_table_exists;
DROP PROCEDURE IF EXISTS add_index_if_table_exists;
DROP PROCEDURE IF EXISTS update_null_branch_if_table_exists;

DELIMITER //

CREATE PROCEDURE add_column_if_table_exists(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_definition TEXT
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table_name
    ) AND NOT EXISTS (
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

CREATE PROCEDURE add_index_if_table_exists(
    IN p_table_name VARCHAR(64),
    IN p_index_name VARCHAR(64),
    IN p_index_definition TEXT
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table_name
    ) AND NOT EXISTS (
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

CREATE PROCEDURE update_null_branch_if_table_exists(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64)
)
BEGIN
    IF @main_branch_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table_name
          AND COLUMN_NAME = p_column_name
    ) THEN
        SET @sql = CONCAT('UPDATE ', p_table_name, ' SET ', p_column_name, ' = ? WHERE ', p_column_name, ' IS NULL');
        PREPARE stmt FROM @sql;
        EXECUTE stmt USING @main_branch_id;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

DELIMITER ;

CALL add_column_if_table_exists('patients', 'registeredBranchId', 'INT NULL AFTER patientId');
CALL add_column_if_table_exists('queue_entries', 'branchId', 'INT NULL AFTER queueId');
CALL add_column_if_table_exists('queue_history', 'branchId', 'INT NULL AFTER historyId');
CALL add_column_if_table_exists('appointments', 'branchId', 'INT NULL AFTER appointmentId');
CALL add_column_if_table_exists('medical_records', 'branchId', 'INT NULL AFTER recordId');
CALL add_column_if_table_exists('prescriptions', 'branchId', 'INT NULL AFTER prescriptionId');
CALL add_column_if_table_exists('lab_test_orders', 'branchId', 'INT NULL AFTER orderId');
CALL add_column_if_table_exists('radiology_orders', 'branchId', 'INT NULL AFTER orderId');
CALL add_column_if_table_exists('invoices', 'branchId', 'INT NULL AFTER invoiceId');
CALL add_column_if_table_exists('payments', 'branchId', 'INT NULL AFTER paymentId');
CALL add_column_if_table_exists('bill_waivers', 'branchId', 'INT NULL AFTER waiverId');
CALL add_column_if_table_exists('drug_inventory', 'branchId', 'INT NULL AFTER drugInventoryId');
CALL add_column_if_table_exists('prescription_external_referrals', 'branchId', 'INT NULL AFTER referralId');
CALL add_column_if_table_exists('prescription_external_referrals', 'originStoreId', 'INT NULL AFTER branchId');
CALL add_column_if_table_exists('prescription_external_referrals', 'originLocationLabel', 'VARCHAR(255) NULL AFTER originStoreId');

CALL add_index_if_table_exists('patients', 'idx_patients_registered_branch', '(registeredBranchId)');
CALL add_index_if_table_exists('queue_entries', 'idx_queue_entries_branch', '(branchId)');
CALL add_index_if_table_exists('queue_history', 'idx_queue_history_branch', '(branchId)');
CALL add_index_if_table_exists('appointments', 'idx_appointments_branch', '(branchId)');
CALL add_index_if_table_exists('medical_records', 'idx_medical_records_branch', '(branchId)');
CALL add_index_if_table_exists('prescriptions', 'idx_prescriptions_branch', '(branchId)');
CALL add_index_if_table_exists('lab_test_orders', 'idx_lab_test_orders_branch', '(branchId)');
CALL add_index_if_table_exists('radiology_orders', 'idx_radiology_orders_branch', '(branchId)');
CALL add_index_if_table_exists('invoices', 'idx_invoices_branch', '(branchId)');
CALL add_index_if_table_exists('payments', 'idx_payments_branch', '(branchId)');
CALL add_index_if_table_exists('bill_waivers', 'idx_bill_waivers_branch', '(branchId)');
CALL add_index_if_table_exists('drug_inventory', 'idx_drug_inventory_branch', '(branchId)');
CALL add_index_if_table_exists('prescription_external_referrals', 'idx_external_referrals_branch', '(branchId)');
CALL add_index_if_table_exists('prescription_external_referrals', 'idx_external_referrals_origin_store', '(originStoreId)');

CALL update_null_branch_if_table_exists('patients', 'registeredBranchId');
CALL update_null_branch_if_table_exists('queue_entries', 'branchId');
CALL update_null_branch_if_table_exists('queue_history', 'branchId');
CALL update_null_branch_if_table_exists('appointments', 'branchId');
CALL update_null_branch_if_table_exists('medical_records', 'branchId');
CALL update_null_branch_if_table_exists('prescriptions', 'branchId');
CALL update_null_branch_if_table_exists('lab_test_orders', 'branchId');
CALL update_null_branch_if_table_exists('radiology_orders', 'branchId');
CALL update_null_branch_if_table_exists('invoices', 'branchId');
CALL update_null_branch_if_table_exists('payments', 'branchId');
CALL update_null_branch_if_table_exists('bill_waivers', 'branchId');
CALL update_null_branch_if_table_exists('drug_inventory', 'branchId');
CALL update_null_branch_if_table_exists('prescription_external_referrals', 'branchId');

UPDATE drug_inventory di
INNER JOIN drug_stores ds ON di.storeId = ds.storeId
SET di.branchId = ds.branchId
WHERE di.storeId IS NOT NULL
  AND ds.branchId IS NOT NULL
  AND (di.branchId IS NULL OR di.branchId <> ds.branchId);

UPDATE prescription_external_referrals r
LEFT JOIN prescriptions p ON r.prescriptionId = p.prescriptionId
LEFT JOIN lab_test_orders lo ON r.labOrderId = lo.orderId
SET r.branchId = COALESCE(r.branchId, p.branchId, lo.branchId, @main_branch_id)
WHERE r.branchId IS NULL;

UPDATE prescription_external_referrals r
INNER JOIN branches b ON r.branchId = b.branchId
SET r.originLocationLabel = COALESCE(r.originLocationLabel, b.branchName)
WHERE r.originLocationLabel IS NULL;

DROP PROCEDURE IF EXISTS update_null_branch_if_table_exists;
DROP PROCEDURE IF EXISTS add_index_if_table_exists;
DROP PROCEDURE IF EXISTS add_column_if_table_exists;
