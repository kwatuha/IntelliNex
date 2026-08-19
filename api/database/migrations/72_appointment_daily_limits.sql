-- Daily appointment booking limits per facility (telemedicine nurse booking).
-- limitDate NULL = recurring default for the branch; a specific date overrides the default.

CREATE TABLE IF NOT EXISTS appointment_daily_limits (
  limitId INT AUTO_INCREMENT PRIMARY KEY,
  branchId INT NOT NULL,
  limitDate DATE NULL COMMENT 'NULL = default daily limit for this facility',
  maxAppointments INT NOT NULL,
  setByUserId INT NULL,
  notes VARCHAR(255) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_appointment_limit_branch_date (branchId, limitDate),
  KEY idx_appointment_limits_branch (branchId),
  CONSTRAINT fk_appointment_limits_branch
    FOREIGN KEY (branchId) REFERENCES branches(branchId)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
