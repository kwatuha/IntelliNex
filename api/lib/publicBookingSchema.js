const pool = require('../config/db');

let ensured = false;

async function ensurePublicBookingTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_appointment_requests (
      requestId INT NOT NULL AUTO_INCREMENT,
      code VARCHAR(20) NOT NULL,
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      nationalId VARCHAR(50) NULL,
      shaMemberNumber VARCHAR(50) NULL,
      clinic VARCHAR(120) NOT NULL,
      preferredDate DATE NOT NULL,
      preferredTime TIME NOT NULL,
      reason TEXT NULL,
      insurance VARCHAR(80) NULL,
      gender VARCHAR(20) NULL,
      status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
      patientId INT NULL,
      appointmentId INT NULL,
      source VARCHAR(80) NULL DEFAULT 'web',
      ipAddress VARCHAR(64) NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      decidedAt TIMESTAMP NULL,
      decidedBy INT NULL,
      PRIMARY KEY (requestId),
      UNIQUE KEY uq_public_booking_code (code),
      INDEX idx_public_booking_status (status, preferredDate),
      INDEX idx_public_booking_phone (phone)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'public_appointment_requests'
       AND COLUMN_NAME IN ('smsStatus', 'smsSentAt')`
  );
  const have = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!have.has('smsStatus')) {
    await pool.query(
      `ALTER TABLE public_appointment_requests ADD COLUMN smsStatus VARCHAR(40) NULL`
    );
  }
  if (!have.has('smsSentAt')) {
    await pool.query(
      `ALTER TABLE public_appointment_requests ADD COLUMN smsSentAt TIMESTAMP NULL`
    );
  }
  ensured = true;
}

module.exports = { ensurePublicBookingTable };
