-- External chemist referral workflow
-- Allows hospital pharmacy/clinicians to refer prescription items to registered external chemists.

CREATE TABLE IF NOT EXISTS external_chemists (
    chemistId INT NOT NULL AUTO_INCREMENT,
    chemistCode VARCHAR(50) UNIQUE,
    chemistName VARCHAR(200) NOT NULL,
    contactPerson VARCHAR(200),
    phone VARCHAR(30),
    email VARCHAR(150),
    address TEXT,
    county VARCHAR(100),
    subcounty VARCHAR(100),
    ward VARCHAR(100),
    latitude DECIMAL(10, 8) NULL,
    longitude DECIMAL(11, 8) NULL,
    licenseNumber VARCHAR(100),
    notes TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chemistId),
    INDEX idx_chemist_name (chemistName),
    INDEX idx_chemist_code (chemistCode),
    INDEX idx_chemist_active (isActive),
    INDEX idx_chemist_location (county, subcounty, ward)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS external_chemist_users (
    chemistUserId INT NOT NULL AUTO_INCREMENT,
    chemistId INT NOT NULL,
    userId INT NOT NULL,
    isPrimary BOOLEAN DEFAULT FALSE,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chemistUserId),
    UNIQUE KEY uniq_external_chemist_user (chemistId, userId),
    INDEX idx_external_chemist_users_user (userId),
    INDEX idx_external_chemist_users_chemist (chemistId),
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prescription_external_referrals (
    referralId INT NOT NULL AUTO_INCREMENT,
    referralNumber VARCHAR(50) UNIQUE NOT NULL,
    prescriptionId INT NOT NULL,
    patientId INT NOT NULL,
    chemistId INT NOT NULL,
    referredBy INT NULL,
    referralDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    pickupDeadline DATE NULL,
    pickupCode VARCHAR(30),
    status ENUM('referred', 'acknowledged', 'ready_for_pickup', 'partially_picked', 'picked_up', 'not_picked', 'cancelled') DEFAULT 'referred',
    patientInstructions TEXT,
    notes TEXT,
    pickedUpByName VARCHAR(200),
    pickedUpByPhone VARCHAR(30),
    acknowledgedAt DATETIME NULL,
    pickedUpAt DATETIME NULL,
    completedAt DATETIME NULL,
    cancelledAt DATETIME NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (referralId),
    INDEX idx_external_referral_number (referralNumber),
    INDEX idx_external_referral_prescription (prescriptionId),
    INDEX idx_external_referral_patient (patientId),
    INDEX idx_external_referral_chemist (chemistId),
    INDEX idx_external_referral_status (status),
    INDEX idx_external_referral_date (referralDate),
    FOREIGN KEY (prescriptionId) REFERENCES prescriptions(prescriptionId) ON DELETE CASCADE,
    FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
    FOREIGN KEY (chemistId) REFERENCES external_chemists(chemistId) ON DELETE RESTRICT,
    FOREIGN KEY (referredBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prescription_external_referral_items (
    referralItemId INT NOT NULL AUTO_INCREMENT,
    referralId INT NOT NULL,
    prescriptionItemId INT NOT NULL,
    medicationId INT NULL,
    medicationName VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    duration VARCHAR(100),
    instructions TEXT,
    quantityReferred INT DEFAULT 1,
    quantityPicked INT DEFAULT 0,
    status ENUM('pending', 'ready_for_pickup', 'picked_up', 'partially_picked', 'not_available', 'not_picked', 'cancelled') DEFAULT 'pending',
    chemistNotes TEXT,
    pickedUpAt DATETIME NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (referralItemId),
    UNIQUE KEY uniq_external_referral_item (referralId, prescriptionItemId),
    INDEX idx_external_referral_items_referral (referralId),
    INDEX idx_external_referral_items_prescription_item (prescriptionItemId),
    INDEX idx_external_referral_items_status (status),
    FOREIGN KEY (referralId) REFERENCES prescription_external_referrals(referralId) ON DELETE CASCADE,
    FOREIGN KEY (prescriptionItemId) REFERENCES prescription_items(itemId) ON DELETE CASCADE,
    FOREIGN KEY (medicationId) REFERENCES medications(medicationId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (roleName, description, isActive)
VALUES ('chemist', 'External chemist/pharmacy partner with access to referred prescriptions', TRUE)
ON DUPLICATE KEY UPDATE description = VALUES(description), isActive = TRUE;
