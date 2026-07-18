const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const CONDITION_FIELDS = [
  'conditionType', 'conditionName', 'diagnosisDate', 'icd10Code', 'status',
  'riskFactors', 'treatmentPlan', 'targetBp', 'targetGlucose', 'smokingStatus',
  'alcoholUse', 'enrolledDate', 'nextReviewDate', 'notes', 'managedBy', 'isActive',
];

const FOLLOW_UP_FIELDS = [
  'ncdId', 'followUpDate', 'controlStatus', 'bpSystolic', 'bpDiastolic',
  'weightKg', 'heightCm', 'bmi', 'bloodGlucose', 'hba1c', 'adherenceNotes',
  'complications', 'planAdjustment', 'nextReviewDate', 'notes',
];

function pickFields(body, allowed) {
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

router.get('/:patientId/ncd', async (req, res) => {
  try {
    const { patientId } = req.params;
    const [conditions] = await pool.execute(
      `SELECT c.*,
              u.firstName AS managedByFirstName,
              u.lastName AS managedByLastName
       FROM patient_ncd_conditions c
       LEFT JOIN users u ON c.managedBy = u.userId
       WHERE c.patientId = ? AND c.isActive = 1
       ORDER BY c.nextReviewDate IS NULL, c.nextReviewDate ASC, c.createdAt DESC`,
      [patientId]
    );
    const [followUps] = await pool.execute(
      `SELECT f.*,
              c.conditionType,
              c.conditionName,
              u.firstName AS recordedByFirstName,
              u.lastName AS recordedByLastName
       FROM patient_ncd_follow_ups f
       INNER JOIN patient_ncd_conditions c ON f.ncdId = c.ncdId
       LEFT JOIN users u ON f.recordedBy = u.userId
       WHERE f.patientId = ?
       ORDER BY f.followUpDate DESC, f.createdAt DESC`,
      [patientId]
    );
    res.status(200).json({ conditions, followUps });
  } catch (error) {
    console.error('Error fetching patient NCD data:', error);
    res.status(500).json({ message: 'Error fetching patient NCD data', error: error.message });
  }
});

router.post('/:patientId/ncd/conditions', async (req, res) => {
  try {
    const { patientId } = req.params;
    const data = pickFields(req.body, CONDITION_FIELDS);
    if (!data.conditionType) {
      return res.status(400).json({ message: 'conditionType is required' });
    }
    const userId = req.user?.id || req.user?.userId || null;
    const [result] = await pool.execute(
      `INSERT INTO patient_ncd_conditions (
        patientId, conditionType, conditionName, diagnosisDate, icd10Code, status,
        riskFactors, treatmentPlan, targetBp, targetGlucose, smokingStatus,
        alcoholUse, enrolledDate, nextReviewDate, notes, managedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        data.conditionType,
        data.conditionName || null,
        data.diagnosisDate || null,
        data.icd10Code || null,
        data.status || 'active',
        data.riskFactors || null,
        data.treatmentPlan || null,
        data.targetBp || null,
        data.targetGlucose || null,
        data.smokingStatus || 'unknown',
        data.alcoholUse || 'unknown',
        data.enrolledDate || null,
        data.nextReviewDate || null,
        data.notes || null,
        data.managedBy || userId,
      ]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM patient_ncd_conditions WHERE ncdId = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating NCD condition:', error);
    res.status(500).json({ message: 'Error creating NCD condition', error: error.message });
  }
});

router.put('/:patientId/ncd/conditions/:id', async (req, res) => {
  try {
    const { patientId, id } = req.params;
    const data = pickFields(req.body, CONDITION_FIELDS);
    const updates = Object.keys(data);
    if (!updates.length) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    const values = updates.map((k) => data[k]);
    values.push(id, patientId);
    await pool.execute(
      `UPDATE patient_ncd_conditions SET ${updates.map((k) => `${k} = ?`).join(', ')}, updatedAt = NOW()
       WHERE ncdId = ? AND patientId = ?`,
      values
    );
    const [rows] = await pool.execute(
      'SELECT * FROM patient_ncd_conditions WHERE ncdId = ? AND patientId = ?',
      [id, patientId]
    );
    if (!rows.length) return res.status(404).json({ message: 'NCD condition not found' });
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error updating NCD condition:', error);
    res.status(500).json({ message: 'Error updating NCD condition', error: error.message });
  }
});

router.delete('/:patientId/ncd/conditions/:id', async (req, res) => {
  try {
    const { patientId, id } = req.params;
    const [result] = await pool.execute(
      `UPDATE patient_ncd_conditions SET isActive = 0, updatedAt = NOW()
       WHERE ncdId = ? AND patientId = ?`,
      [id, patientId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'NCD condition not found' });
    res.status(200).json({ message: 'NCD condition removed', ncdId: Number(id) });
  } catch (error) {
    console.error('Error deleting NCD condition:', error);
    res.status(500).json({ message: 'Error deleting NCD condition', error: error.message });
  }
});

router.post('/:patientId/ncd/follow-ups', async (req, res) => {
  try {
    const { patientId } = req.params;
    const data = pickFields(req.body, FOLLOW_UP_FIELDS);
    if (!data.ncdId || !data.followUpDate) {
      return res.status(400).json({ message: 'ncdId and followUpDate are required' });
    }
    const userId = req.user?.id || req.user?.userId || null;
    let bmi = data.bmi ?? null;
    if (bmi == null && data.weightKg && data.heightCm) {
      const h = Number(data.heightCm) / 100;
      if (h > 0) bmi = Math.round((Number(data.weightKg) / (h * h)) * 10) / 10;
    }
    const [result] = await pool.execute(
      `INSERT INTO patient_ncd_follow_ups (
        ncdId, patientId, followUpDate, controlStatus, bpSystolic, bpDiastolic,
        weightKg, heightCm, bmi, bloodGlucose, hba1c, adherenceNotes,
        complications, planAdjustment, nextReviewDate, notes, recordedBy
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.ncdId,
        patientId,
        data.followUpDate,
        data.controlStatus || 'stable',
        data.bpSystolic ?? null,
        data.bpDiastolic ?? null,
        data.weightKg ?? null,
        data.heightCm ?? null,
        bmi,
        data.bloodGlucose ?? null,
        data.hba1c ?? null,
        data.adherenceNotes || null,
        data.complications || null,
        data.planAdjustment || null,
        data.nextReviewDate || null,
        data.notes || null,
        userId,
      ]
    );
    if (data.nextReviewDate) {
      await pool.execute(
        'UPDATE patient_ncd_conditions SET nextReviewDate = ?, updatedAt = NOW() WHERE ncdId = ? AND patientId = ?',
        [data.nextReviewDate, data.ncdId, patientId]
      );
    }
    const [rows] = await pool.execute(
      'SELECT * FROM patient_ncd_follow_ups WHERE followUpId = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating NCD follow-up:', error);
    res.status(500).json({ message: 'Error creating NCD follow-up', error: error.message });
  }
});

router.put('/:patientId/ncd/follow-ups/:id', async (req, res) => {
  try {
    const { patientId, id } = req.params;
    const data = pickFields(req.body, FOLLOW_UP_FIELDS);
    delete data.ncdId;
    const updates = Object.keys(data);
    if (!updates.length) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    const values = updates.map((k) => data[k]);
    values.push(id, patientId);
    await pool.execute(
      `UPDATE patient_ncd_follow_ups SET ${updates.map((k) => `${k} = ?`).join(', ')}, updatedAt = NOW()
       WHERE followUpId = ? AND patientId = ?`,
      values
    );
    const [rows] = await pool.execute(
      'SELECT * FROM patient_ncd_follow_ups WHERE followUpId = ? AND patientId = ?',
      [id, patientId]
    );
    if (!rows.length) return res.status(404).json({ message: 'NCD follow-up not found' });
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error updating NCD follow-up:', error);
    res.status(500).json({ message: 'Error updating NCD follow-up', error: error.message });
  }
});

router.delete('/:patientId/ncd/follow-ups/:id', async (req, res) => {
  try {
    const { patientId, id } = req.params;
    const [result] = await pool.execute(
      'DELETE FROM patient_ncd_follow_ups WHERE followUpId = ? AND patientId = ?',
      [id, patientId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'NCD follow-up not found' });
    res.status(200).json({ message: 'NCD follow-up deleted', followUpId: Number(id) });
  } catch (error) {
    console.error('Error deleting NCD follow-up:', error);
    res.status(500).json({ message: 'Error deleting NCD follow-up', error: error.message });
  }
});

module.exports = router;
