-- Drug availability maintained by external chemists.
-- This is intentionally lighter than hospital inventory: it tracks whether a chemist
-- currently has a drug, approximate quantity, price, expiry, and last confirmation.

CREATE TABLE IF NOT EXISTS external_chemist_drug_availability (
    chemistDrugId INT NOT NULL AUTO_INCREMENT,
    chemistId INT NOT NULL,
    medicationId INT NULL,
    medicationName VARCHAR(255) NOT NULL,
    genericName VARCHAR(255),
    strength VARCHAR(100),
    dosageForm VARCHAR(100),
    quantityAvailable INT DEFAULT 0,
    availabilityStatus ENUM('available', 'low_stock', 'out_of_stock', 'unknown') DEFAULT 'unknown',
    unitPrice DECIMAL(12, 2) NULL,
    expiryDate DATE NULL,
    lastConfirmedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chemistDrugId),
    UNIQUE KEY uniq_external_chemist_catalog_medication (chemistId, medicationId),
    INDEX idx_external_chemist_drugs_chemist (chemistId),
    INDEX idx_external_chemist_drugs_medication (medicationId),
    INDEX idx_external_chemist_drugs_status (availabilityStatus),
    INDEX idx_external_chemist_drugs_name (medicationName),
    INDEX idx_external_chemist_drugs_confirmed (lastConfirmedAt),
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE CASCADE,
    FOREIGN KEY (medicationId) REFERENCES medications(medicationId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
