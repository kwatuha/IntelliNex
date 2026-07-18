/**
 * Ensure field-dataset tables exist (MySQL). Safe to call on route use.
 */
const pool = require('../config/db');

let ensured = false;

async function ensureDataCollectionTables() {
  if (ensured) return;
  await pool.query(`
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
      INDEX idx_dct_category (templateCategory)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
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
      INDEX idx_dcs_created_by (createdBy)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed sample surveillance form when table is empty (migration seed may not have run on deploy)
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM data_collection_templates WHERE voided = 0`
  );
  const cnt = Number(countRows?.[0]?.cnt || 0);
  if (cnt === 0) {
    const structure = {
      sections: [
        {
          id: 'case',
          title: 'Case details',
          items: [
            { id: 'patient_name', label: 'Patient name', type: 'text', required: true },
            { id: 'age_years', label: 'Age (years)', type: 'number', required: true },
            {
              id: 'sex',
              label: 'Sex',
              type: 'select',
              required: true,
              options: ['Female', 'Male', 'Other', 'Unknown'],
            },
            { id: 'condition', label: 'Suspected / confirmed condition', type: 'text', required: true },
            { id: 'onset_date', label: 'Date of onset (YYYY-MM-DD)', type: 'text', required: false },
            { id: 'facility_or_village', label: 'Facility or village', type: 'text', required: true },
            { id: 'notes', label: 'Notes', type: 'textarea', required: false },
            { id: 'site_gps', label: 'Capture GPS', type: 'location', required: false, requireGps: true },
            { id: 'site_photo', label: 'Photo (optional)', type: 'photo', required: false, maxPhotos: 3 },
          ],
        },
      ],
    };
    await pool.execute(
      `INSERT INTO data_collection_templates
       (name, description, templateCategory, structure, allowedSubjectTypes, isActive, voided)
       VALUES (?, ?, ?, ?, ?, 1, 0)`,
      [
        'Notifiable disease line list',
        'Sample field form for outbreak / notifiable disease case capture. Edit or replace in Field Datasets.',
        'surveillance',
        JSON.stringify(structure),
        JSON.stringify(['standalone', 'facility', 'patient']),
      ]
    );
  }

  ensured = true;
}

function parseJsonCol(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStructure(raw) {
  const structure = parseJsonCol(raw, { sections: [] });
  const sections = Array.isArray(structure?.sections) ? structure.sections : [];
  return {
    sections: sections.map((s, si) => ({
      id: String(s?.id || `section_${si + 1}`),
      title: String(s?.title || `Section ${si + 1}`),
      items: Array.isArray(s?.items)
        ? s.items.map((item, ii) => ({
            id: String(item?.id || `item_${si + 1}_${ii + 1}`),
            label: String(item?.label || `Item ${ii + 1}`),
            type: String(item?.type || 'text'),
            required: Boolean(item?.required),
            options: Array.isArray(item?.options) ? item.options.map(String) : undefined,
            maxPhotos: item?.maxPhotos != null ? Number(item.maxPhotos) : undefined,
            requireGps: item?.requireGps != null ? Boolean(item.requireGps) : undefined,
            showIf: item?.showIf || undefined,
          }))
        : [],
    })),
  };
}

function rowToTemplate(row) {
  if (!row) return null;
  return {
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    templateCategory: row.templateCategory,
    structure: normalizeStructure(row.structure),
    allowedSubjectTypes: parseJsonCol(row.allowedSubjectTypes, ['standalone']),
    isActive: Boolean(row.isActive),
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

function rowToSubmission(row) {
  if (!row) return null;
  return {
    submissionId: row.submissionId,
    templateId: row.templateId,
    templateName: row.templateName || undefined,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectLabel: row.subjectLabel,
    visitDate: row.visitDate,
    title: row.title,
    answers: parseJsonCol(row.answers, {}),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    accuracyMeters: row.accuracyMeters != null ? Number(row.accuracyMeters) : null,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  ensureDataCollectionTables,
  normalizeStructure,
  parseJsonCol,
  rowToTemplate,
  rowToSubmission,
};
