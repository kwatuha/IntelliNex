-- IntelliNex Field Android APK distribution (MySQL).

CREATE TABLE IF NOT EXISTS mobile_app_releases (
  releaseId INT NOT NULL AUTO_INCREMENT,
  version VARCHAR(64) NOT NULL,
  releaseNotes TEXT NULL,
  originalFileName VARCHAR(255) NOT NULL,
  storedFileName VARCHAR(255) NOT NULL,
  mimeType VARCHAR(120) NULL,
  fileSize BIGINT NULL,
  uploadedByUserId INT NULL,
  voided TINYINT(1) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (releaseId),
  INDEX idx_mobile_app_releases_active (voided, createdAt),
  FOREIGN KEY (uploadedByUserId) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mobile_app_release_acknowledgements (
  userId INT NOT NULL,
  releaseId INT NOT NULL,
  acknowledgedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, releaseId),
  FOREIGN KEY (releaseId) REFERENCES mobile_app_releases(releaseId) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(userId) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mobile_app_usage_events (
  eventId INT NOT NULL AUTO_INCREMENT,
  userId INT NULL,
  releaseId INT NULL,
  eventType VARCHAR(40) NOT NULL,
  appVersion VARCHAR(64) NULL,
  releaseVersion VARCHAR(64) NULL,
  userAgent VARCHAR(512) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (eventId),
  INDEX idx_mobile_app_usage_user (userId, createdAt),
  INDEX idx_mobile_app_usage_type (eventType, createdAt),
  FOREIGN KEY (releaseId) REFERENCES mobile_app_releases(releaseId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
