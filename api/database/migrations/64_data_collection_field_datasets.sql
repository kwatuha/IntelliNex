-- Field data collection / surveillance datasets for IntelliNex Field (mobile-collector).
-- Templates are authored in HMIS; submissions sync from the offline mobile app.

CREATE TABLE IF NOT EXISTS data_collection_templates (
    templateId INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT NULL,
    templateCategory VARCHAR(80) NOT NULL DEFAULT 'surveillance',
    structure JSON NOT NULL,
    allowedSubjectTypes JSON NULL,
    isActive TINYINT(1) NOT NULL DEFAULT 1,
    voided TINYINT(1) NOT NULL DEFAULT 0,
    createdBy INT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (templateId),
    INDEX idx_dct_active (isActive, voided),
    INDEX idx_dct_category (templateCategory),
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_collection_submissions (
    submissionId INT NOT NULL AUTO_INCREMENT,
    templateId INT NOT NULL,
    subjectType VARCHAR(40) NOT NULL DEFAULT 'standalone',
    subjectId INT NULL,
    subjectLabel VARCHAR(255) NULL,
    visitDate DATE NULL,
    title VARCHAR(255) NULL,
    answers JSON NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    accuracyMeters DECIMAL(10, 2) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'submitted',
    voided TINYINT(1) NOT NULL DEFAULT 0,
    createdBy INT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (submissionId),
    INDEX idx_dcs_template (templateId),
    INDEX idx_dcs_subject (subjectType, subjectId),
    INDEX idx_dcs_visit_date (visitDate),
    INDEX idx_dcs_created_by (createdBy),
    FOREIGN KEY (templateId) REFERENCES data_collection_templates(templateId) ON DELETE RESTRICT,
    FOREIGN KEY (createdBy) REFERENCES users(userId) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed a sample surveillance checklist (idempotent by name).
INSERT INTO data_collection_templates (name, description, templateCategory, structure, allowedSubjectTypes, isActive, voided)
SELECT
  'Notifiable disease line list',
  'Sample field form for outbreak / notifiable disease case capture. Edit or replace in Field Datasets.',
  'surveillance',
  JSON_OBJECT(
    'sections', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'case',
        'title', 'Case details',
        'items', JSON_ARRAY(
          JSON_OBJECT('id', 'patient_name', 'label', 'Patient name', 'type', 'text', 'required', true),
          JSON_OBJECT('id', 'age_years', 'label', 'Age (years)', 'type', 'number', 'required', true),
          JSON_OBJECT('id', 'sex', 'label', 'Sex', 'type', 'select', 'required', true,
            'options', JSON_ARRAY('Female', 'Male', 'Other', 'Unknown')),
          JSON_OBJECT('id', 'condition', 'label', 'Suspected / confirmed condition', 'type', 'text', 'required', true),
          JSON_OBJECT('id', 'onset_date', 'label', 'Date of onset (YYYY-MM-DD)', 'type', 'text', 'required', false),
          JSON_OBJECT('id', 'facility_or_village', 'label', 'Facility or village', 'type', 'text', 'required', true),
          JSON_OBJECT('id', 'notes', 'label', 'Notes', 'type', 'textarea', 'required', false),
          JSON_OBJECT('id', 'site_gps', 'label', 'Capture GPS', 'type', 'location', 'required', false, 'requireGps', true),
          JSON_OBJECT('id', 'site_photo', 'label', 'Photo (optional)', 'type', 'photo', 'required', false, 'maxPhotos', 3)
        )
      )
    )
  ),
  JSON_ARRAY('standalone', 'facility', 'patient'),
  1,
  0
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM data_collection_templates WHERE name = 'Notifiable disease line list' AND voided = 0
);
