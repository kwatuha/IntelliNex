-- Kiplombe Medical Centre HMIS Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS intellinex_hmis_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE intellinex_hmis_db;

-- ============================================
-- ROLES AND PRIVILEGES
-- ============================================

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    roleId INT NOT NULL AUTO_INCREMENT,
    roleName VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    isActive BOOLEAN DEFAULT TRUE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (roleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Privileges table
CREATE TABLE IF NOT EXISTS privileges (
    privilegeId INT NOT NULL AUTO_INCREMENT,
    privilegeName VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    module VARCHAR(50),
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (privilegeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Role privileges junction table
CREATE TABLE IF NOT EXISTS role_privileges (
    roleId INT NOT NULL,
    privilegeId INT NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (roleId, privilegeId),
    FOREIGN KEY (roleId) REFERENCES roles(roleId) ON DELETE CASCADE,
    FOREIGN KEY (privilegeId) REFERENCES privileges(privilegeId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- USERS
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    userId INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    passwordHash VARCHAR(255) NOT NULL,
    firstName VARCHAR(100),
    lastName VARCHAR(100),
    phone VARCHAR(20),
    roleId INT,
    department VARCHAR(100),
    isActive BOOLEAN DEFAULT TRUE,
    lastLogin TIMESTAMP NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    voided BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (userId),
    FOREIGN KEY (roleId) REFERENCES roles(roleId) ON DELETE SET NULL,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (roleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insurance providers are referenced by patients; keep the provider catalog in
-- the base schema so a fresh database can initialize before module schemas run.
CREATE TABLE IF NOT EXISTS insurance_providers (
    providerId INT NOT NULL AUTO_INCREMENT,
    providerCode VARCHAR(50) UNIQUE,
    providerName VARCHAR(200) NOT NULL,
    contactPerson VARCHAR(200),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    claimsAddress TEXT,
    website VARCHAR(200),
    isActive BOOLEAN DEFAULT TRUE,
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (providerId),
    INDEX idx_provider_code (providerCode),
    INDEX idx_provider_name (providerName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PATIENTS
-- ============================================

CREATE TABLE IF NOT EXISTS patients (
    patientId INT NOT NULL AUTO_INCREMENT,
    patientNumber VARCHAR(50) UNIQUE,
    firstName VARCHAR(100) NOT NULL,
    lastName VARCHAR(100) NOT NULL,
    middleName VARCHAR(100),
    dateOfBirth DATE,
    gender ENUM('Male', 'Female', 'Other') NOT NULL,
    patientType ENUM('paying', 'insurance') DEFAULT 'paying',
    insuranceCompanyId INT,
    insuranceNumber VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    county VARCHAR(100),
    subcounty VARCHAR(100),
    ward VARCHAR(100),
    idNumber VARCHAR(50),
    idType ENUM('National ID', 'Passport', 'Birth Certificate', 'Other'),
    nextOfKinName VARCHAR(200),
    nextOfKinPhone VARCHAR(20),
    nextOfKinRelationship VARCHAR(50),
    bloodGroup VARCHAR(10),
    allergies TEXT,
    medicalHistory TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy INT,
    voided BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (patientId),
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (insuranceCompanyId) REFERENCES insurance_providers(providerId) ON DELETE SET NULL,
    INDEX idx_patient_number (patientNumber),
    INDEX idx_name (firstName, lastName),
    INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- APPOINTMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS appointments (
    appointmentId INT NOT NULL AUTO_INCREMENT,
    patientId INT NOT NULL,
    doctorId INT,
    appointmentDate DATE NOT NULL,
    appointmentTime TIME NOT NULL,
    department VARCHAR(100),
    reason TEXT,
    status ENUM('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy INT,
    PRIMARY KEY (appointmentId),
    FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
    FOREIGN KEY (doctorId) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL,
    INDEX idx_patient (patientId),
    INDEX idx_doctor (doctorId),
    INDEX idx_date (appointmentDate),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- QUEUE MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS queue_entries (
    queueId INT NOT NULL AUTO_INCREMENT,
    patientId INT NOT NULL,
    ticketNumber VARCHAR(50) NOT NULL,
    servicePoint VARCHAR(50) NOT NULL,
    priority ENUM('normal', 'urgent', 'emergency') DEFAULT 'normal',
    status ENUM('waiting', 'called', 'serving', 'completed', 'cancelled') DEFAULT 'waiting',
    estimatedWaitTime INT,
    arrivalTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    calledTime TIMESTAMP NULL,
    startTime TIMESTAMP NULL,
    endTime TIMESTAMP NULL,
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy INT,
    PRIMARY KEY (queueId),
    FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL,
    INDEX idx_ticket (ticketNumber),
    INDEX idx_patient (patientId),
    INDEX idx_status (status),
    INDEX idx_service_point (servicePoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- BILLING AND CHARGES
-- ============================================

CREATE TABLE IF NOT EXISTS service_charges (
    chargeId INT NOT NULL AUTO_INCREMENT,
    chargeCode VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    department VARCHAR(100),
    cost DECIMAL(15, 2) NOT NULL,
    description TEXT,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chargeId),
    INDEX idx_code (chargeCode),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS specialist_charges (
    specialistChargeId INT NOT NULL AUTO_INCREMENT,
    chargeId INT NOT NULL,
    doctorId INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    effectiveFrom DATE NOT NULL,
    effectiveTo DATE NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (specialistChargeId),
    FOREIGN KEY (chargeId) REFERENCES service_charges(chargeId) ON DELETE CASCADE,
    FOREIGN KEY (doctorId) REFERENCES users(userId) ON DELETE CASCADE,
    INDEX idx_charge (chargeId),
    INDEX idx_doctor (doctorId),
    INDEX idx_effective_dates (effectiveFrom, effectiveTo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consumables_charges (
    consumableChargeId INT NOT NULL AUTO_INCREMENT,
    chargeId INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    effectiveFrom DATE NOT NULL,
    effectiveTo DATE NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (consumableChargeId),
    FOREIGN KEY (chargeId) REFERENCES service_charges(chargeId) ON DELETE CASCADE,
    INDEX idx_charge (chargeId),
    INDEX idx_effective_dates (effectiveFrom, effectiveTo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
    invoiceId INT NOT NULL AUTO_INCREMENT,
    invoiceNumber VARCHAR(50) UNIQUE NOT NULL,
    patientId INT NOT NULL,
    invoiceDate DATE NOT NULL,
    dueDate DATE,
    totalAmount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    paidAmount DECIMAL(15, 2) DEFAULT 0,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    status ENUM('draft', 'pending', 'partial', 'paid', 'cancelled') DEFAULT 'pending',
    paymentMethod VARCHAR(50),
    notes TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy INT,
    PRIMARY KEY (invoiceId),
    FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL,
    INDEX idx_invoice_number (invoiceNumber),
    INDEX idx_patient (patientId),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
    itemId INT NOT NULL AUTO_INCREMENT,
    invoiceId INT NOT NULL,
    chargeId INT,
    description VARCHAR(200),
    quantity INT DEFAULT 1,
    unitPrice DECIMAL(15, 2) NOT NULL,
    totalPrice DECIMAL(15, 2) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (itemId),
    FOREIGN KEY (invoiceId) REFERENCES invoices(invoiceId) ON DELETE CASCADE,
    FOREIGN KEY (chargeId) REFERENCES service_charges(chargeId) ON DELETE SET NULL,
    INDEX idx_invoice (invoiceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INVENTORY
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_items (
    itemId INT NOT NULL AUTO_INCREMENT,
    itemCode VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    unit VARCHAR(50),
    quantity INT DEFAULT 0,
    reorderLevel INT DEFAULT 0,
    unitPrice DECIMAL(15, 2),
    supplier VARCHAR(200),
    expiryDate DATE,
    location VARCHAR(100),
    description TEXT,
    status ENUM('Active', 'Inactive', 'Expired') DEFAULT 'Active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy INT,
    PRIMARY KEY (itemId),
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL,
    INDEX idx_code (itemCode),
    INDEX idx_category (category),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MEDICAL RECORDS
-- ============================================

CREATE TABLE IF NOT EXISTS medical_records (
    recordId INT NOT NULL AUTO_INCREMENT,
    patientId INT NOT NULL,
    visitDate DATE NOT NULL,
    visitType ENUM('Outpatient', 'Inpatient', 'Emergency') DEFAULT 'Outpatient',
    department VARCHAR(100),
    chiefComplaint TEXT,
    symptoms TEXT,
    historyOfPresentIllness TEXT,
    physicalExamination TEXT,
    diagnosis TEXT,
    treatment TEXT,
    outcome TEXT,
    prescription TEXT,
    notes TEXT,
    doctorId INT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    createdBy INT,
    PRIMARY KEY (recordId),
    FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
    FOREIGN KEY (doctorId) REFERENCES users(userId) ON DELETE SET NULL,
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL,
    INDEX idx_patient (patientId),
    INDEX idx_visit_date (visitDate),
    INDEX idx_doctor (doctorId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INITIAL DATA
-- ============================================

-- Insert default roles
INSERT INTO roles (roleName, description) VALUES
('admin', 'System Administrator with full access'),
('doctor', 'Medical Doctor'),
('nurse', 'Nursing Staff'),
('lab_technician', 'Laboratory Technician'),
('registration', 'Registration Officer'),
('billing', 'Billing and Finance Officer'),
('pharmacy', 'Pharmacist'),
('radiology', 'Radiology Technician')
ON DUPLICATE KEY UPDATE roleName=roleName;

-- Insert default admin user (password: admin123)
-- Password hash for 'admin123' using bcrypt (salt rounds: 10)
-- To generate: bcrypt.hash('admin123', 10)
-- This hash is for 'admin123': $2a$10$Bh4D5wLo7y8SUR2iRpWqb./mhRvXj0jF9vLfytXi9KYEthcgPNid2
INSERT INTO users (username, email, passwordHash, firstName, lastName, roleId, department, isActive) VALUES
('admin', 'admin@kiplombe.com', '$2a$10$Bh4D5wLo7y8SUR2iRpWqb./mhRvXj0jF9vLfytXi9KYEthcgPNid2', 'System', 'Administrator',
 (SELECT roleId FROM roles WHERE roleName = 'admin'), 'IT', TRUE)
ON DUPLICATE KEY UPDATE username=username;

