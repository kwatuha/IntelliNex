/**
 * Field datasets / surveillance data collection API for IntelliNex Field mobile app.
 * Mounted at /api/data-collection
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const {
  ensureDataCollectionTables,
  normalizeStructure,
  parseJsonCol,
  rowToTemplate,
  rowToSubmission,
} = require('../lib/dataCollectionSchema');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret_for_dev_only_change_this_asap';

function userFromReq(req) {
  if (req.user?.id != null) return req.user;
  if (req.user?.userId != null) return req.user;
  const authHeader = req.header('Authorization');
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.user || decoded;
  } catch {
    return null;
  }
}

function userIdFromReq(req) {
  const u = userFromReq(req);
  if (!u) return null;
  const id = Number(u.id ?? u.userId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

router.use(async (_req, _res, next) => {
  try {
    await ensureDataCollectionTables();
    next();
  } catch (err) {
    next(err);
  }
});

/** GET /api/data-collection/templates */
router.get('/templates', async (req, res) => {
  try {
    const category = req.query.category ? String(req.query.category).trim() : null;
    const includeInactive = String(req.query.includeInactive || '') === '1';
    const params = [];
    let sql = `
      SELECT templateId, name, description, templateCategory, structure, allowedSubjectTypes,
             isActive, createdBy, createdAt, updatedAt
      FROM data_collection_templates
      WHERE voided = 0
    `;
    if (!includeInactive) {
      sql += ' AND isActive = 1';
    }
    if (category) {
      sql += ' AND templateCategory = ?';
      params.push(category);
    }
    sql += ' ORDER BY name ASC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(rowToTemplate));
  } catch (err) {
    console.error('data-collection templates list:', err);
    res.status(500).json({ error: err.message || 'Failed to list templates' });
  }
});

/** GET /api/data-collection/templates/:id */
router.get('/templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.execute(
      `SELECT templateId, name, description, templateCategory, structure, allowedSubjectTypes,
              isActive, createdBy, createdAt, updatedAt
       FROM data_collection_templates
       WHERE templateId = ? AND voided = 0`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json(rowToTemplate(rows[0]));
  } catch (err) {
    console.error('data-collection template get:', err);
    res.status(500).json({ error: err.message || 'Failed to load template' });
  }
});

/** POST /api/data-collection/templates */
router.post('/templates', async (req, res) => {
  try {
    const userId = userIdFromReq(req);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const description = req.body?.description != null ? String(req.body.description) : null;
    const templateCategory = String(req.body?.templateCategory || 'surveillance').trim() || 'surveillance';
    const structure = normalizeStructure(req.body?.structure || { sections: [] });
    const allowedSubjectTypes = Array.isArray(req.body?.allowedSubjectTypes)
      ? req.body.allowedSubjectTypes.map(String)
      : ['standalone'];
    const isActive = req.body?.isActive === false || req.body?.isActive === 0 ? 0 : 1;

    const [result] = await pool.execute(
      `INSERT INTO data_collection_templates
       (name, description, templateCategory, structure, allowedSubjectTypes, isActive, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description,
        templateCategory,
        JSON.stringify(structure),
        JSON.stringify(allowedSubjectTypes),
        isActive,
        userId,
      ]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM data_collection_templates WHERE templateId = ?`,
      [result.insertId]
    );
    res.status(201).json(rowToTemplate(rows[0]));
  } catch (err) {
    console.error('data-collection template create:', err);
    res.status(500).json({ error: err.message || 'Failed to create template' });
  }
});

/** PATCH /api/data-collection/templates/:id */
router.patch('/templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await pool.execute(
      `SELECT * FROM data_collection_templates WHERE templateId = ? AND voided = 0`,
      [id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Template not found' });

    const row = existing[0];
    const name = req.body?.name != null ? String(req.body.name).trim() : row.name;
    const description =
      req.body?.description !== undefined
        ? req.body.description == null
          ? null
          : String(req.body.description)
        : row.description;
    const templateCategory =
      req.body?.templateCategory != null
        ? String(req.body.templateCategory).trim() || row.templateCategory
        : row.templateCategory;
    const structure =
      req.body?.structure != null ? normalizeStructure(req.body.structure) : normalizeStructure(row.structure);
    const allowedSubjectTypes =
      req.body?.allowedSubjectTypes != null
        ? Array.isArray(req.body.allowedSubjectTypes)
          ? req.body.allowedSubjectTypes.map(String)
          : parseJsonCol(row.allowedSubjectTypes, ['standalone'])
        : parseJsonCol(row.allowedSubjectTypes, ['standalone']);
    const isActive =
      req.body?.isActive !== undefined
        ? req.body.isActive === false || req.body.isActive === 0
          ? 0
          : 1
        : row.isActive;

    await pool.execute(
      `UPDATE data_collection_templates
       SET name = ?, description = ?, templateCategory = ?, structure = ?,
           allowedSubjectTypes = ?, isActive = ?, updatedAt = NOW()
       WHERE templateId = ?`,
      [
        name,
        description,
        templateCategory,
        JSON.stringify(structure),
        JSON.stringify(allowedSubjectTypes),
        isActive,
        id,
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM data_collection_templates WHERE templateId = ?`, [id]);
    res.json(rowToTemplate(rows[0]));
  } catch (err) {
    console.error('data-collection template update:', err);
    res.status(500).json({ error: err.message || 'Failed to update template' });
  }
});

/** DELETE /api/data-collection/templates/:id (soft) */
router.delete('/templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [result] = await pool.execute(
      `UPDATE data_collection_templates SET voided = 1, isActive = 0, updatedAt = NOW() WHERE templateId = ? AND voided = 0`,
      [id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('data-collection template delete:', err);
    res.status(500).json({ error: err.message || 'Failed to delete template' });
  }
});

/** GET /api/data-collection/submissions */
router.get('/submissions', async (req, res) => {
  try {
    const templateId = req.query.templateId ? Number(req.query.templateId) : null;
    const mine = String(req.query.mine || '') === '1';
    const userId = userIdFromReq(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const params = [];
    let sql = `
      SELECT s.*, t.name AS templateName
      FROM data_collection_submissions s
      INNER JOIN data_collection_templates t ON t.templateId = s.templateId
      WHERE s.voided = 0
    `;
    if (templateId) {
      sql += ' AND s.templateId = ?';
      params.push(templateId);
    }
    if (mine) {
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      sql += ' AND s.createdBy = ?';
      params.push(userId);
    }
    // mysql2 execute() rejects bound LIMIT on some servers — interpolate safe int
    sql += ` ORDER BY s.createdAt DESC LIMIT ${limit}`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(rowToSubmission));
  } catch (err) {
    console.error('data-collection submissions list:', err);
    res.status(500).json({ error: err.message || 'Failed to list submissions' });
  }
});

/** POST /api/data-collection/submissions */
router.post('/submissions', async (req, res) => {
  try {
    const userId = userIdFromReq(req);
    const templateId = Number(req.body?.templateId);
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'templateId is required' });
    }
    const [tplRows] = await pool.execute(
      `SELECT templateId FROM data_collection_templates WHERE templateId = ? AND voided = 0 AND isActive = 1`,
      [templateId]
    );
    if (!tplRows.length) return res.status(404).json({ error: 'Template not found or inactive' });

    const subjectType = String(req.body?.subjectType || 'standalone').trim() || 'standalone';
    const subjectId =
      req.body?.subjectId != null && String(req.body.subjectId).trim() !== ''
        ? Number(req.body.subjectId)
        : null;
    const subjectLabel = req.body?.subjectLabel != null ? String(req.body.subjectLabel).slice(0, 255) : null;
    const visitDate = req.body?.visitDate || null;
    const title = req.body?.title != null ? String(req.body.title).slice(0, 255) : null;
    const answers =
      req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const latitude = req.body?.latitude != null ? Number(req.body.latitude) : null;
    const longitude = req.body?.longitude != null ? Number(req.body.longitude) : null;
    const accuracyMeters = req.body?.accuracyMeters != null ? Number(req.body.accuracyMeters) : null;
    const status = String(req.body?.status || 'submitted').trim() || 'submitted';

    const [result] = await pool.execute(
      `INSERT INTO data_collection_submissions
       (templateId, subjectType, subjectId, subjectLabel, visitDate, title, answers,
        latitude, longitude, accuracyMeters, status, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        templateId,
        subjectType,
        Number.isFinite(subjectId) ? subjectId : null,
        subjectLabel,
        visitDate,
        title,
        JSON.stringify(answers),
        Number.isFinite(latitude) ? latitude : null,
        Number.isFinite(longitude) ? longitude : null,
        Number.isFinite(accuracyMeters) ? accuracyMeters : null,
        status,
        userId,
      ]
    );
    const [rows] = await pool.execute(
      `SELECT s.*, t.name AS templateName
       FROM data_collection_submissions s
       INNER JOIN data_collection_templates t ON t.templateId = s.templateId
       WHERE s.submissionId = ?`,
      [result.insertId]
    );
    res.status(201).json(rowToSubmission(rows[0]));
  } catch (err) {
    console.error('data-collection submission create:', err);
    res.status(500).json({ error: err.message || 'Failed to create submission' });
  }
});

module.exports = router;
