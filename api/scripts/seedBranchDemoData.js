/**
 * Seed multi-facility (branch) demo data for performance / cross-facility reporting.
 *
 * Idempotent: removes previous rows tagged with [BRANCH-DEMO] then recreates.
 *
 * Usage (from api/ with DB env loaded):
 *   node scripts/seedBranchDemoData.js
 *
 * On VPS:
 *   docker exec -i kiplombe_api node /app/scripts/seedBranchDemoData.js
 */
require('../config/load-env');
const crypto = require('crypto');
const pool = require('../config/db');

const DEMO_TAG = '[BRANCH-DEMO]';

const DEMO_PATIENTS = {
  2: [
    // Langas
    { first: 'Achieng', last: 'Otieno', gender: 'Female', phone: '0711002001' },
    { first: 'Brian', last: 'Kiprono', gender: 'Male', phone: '0711002002' },
    { first: 'Caroline', last: 'Wanjiku', gender: 'Female', phone: '0711002003' },
    { first: 'Daniel', last: 'Mwangi', gender: 'Male', phone: '0711002004' },
    { first: 'Esther', last: 'Chebet', gender: 'Female', phone: '0711002005' },
    { first: 'Felix', last: 'Omondi', gender: 'Male', phone: '0711002006' },
    { first: 'Grace', last: 'Njeri', gender: 'Female', phone: '0711002007' },
    { first: 'Hassan', last: 'Ali', gender: 'Male', phone: '0711002008' },
  ],
  3: [
    // Elburgon
    { first: 'Irene', last: 'Mutai', gender: 'Female', phone: '0722003001' },
    { first: 'James', last: 'Koech', gender: 'Male', phone: '0722003002' },
    { first: 'Karen', last: 'Cherono', gender: 'Female', phone: '0722003003' },
    { first: 'Leo', last: 'Rotich', gender: 'Male', phone: '0722003004' },
    { first: 'Mary', last: 'Langat', gender: 'Female', phone: '0722003005' },
    { first: 'Noah', last: 'Kimutai', gender: 'Male', phone: '0722003006' },
    { first: 'Olivia', last: 'Chepkoech', gender: 'Female', phone: '0722003007' },
    { first: 'Peter', last: 'Sigei', gender: 'Male', phone: '0722003008' },
    { first: 'Queenie', last: 'Too', gender: 'Female', phone: '0722003009' },
    { first: 'Ryan', last: 'Bett', gender: 'Male', phone: '0722003010' },
  ],
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function timeToday(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function ensureBranches(conn) {
  const [branches] = await conn.execute(
    `SELECT branchId, branchCode, branchName, isMainBranch, isActive
     FROM branches WHERE isActive = 1 ORDER BY isMainBranch DESC, branchId`
  );
  if (branches.length < 2) {
    throw new Error('Need at least 2 active branches. Create branches in Settings first.');
  }
  return branches;
}

async function ensureStore(conn, branchId, code, name, isDispensing) {
  const [existing] = await conn.execute(
    `SELECT storeId FROM drug_stores WHERE branchId = ? AND (storeCode = ? OR storeName = ?) LIMIT 1`,
    [branchId, code, name]
  );
  if (existing.length) return existing[0].storeId;
  const [r] = await conn.execute(
    `INSERT INTO drug_stores
      (storeCode, storeName, branchId, isDispensingStore, isActive, notes)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [code, name, branchId, isDispensing ? 1 : 0, `${DEMO_TAG} demo store`]
  );
  return r.insertId;
}

async function cleanupPreviousDemo(conn) {
  // Delete by DEMO_TAG notes / patientNumber prefix
  const [demoPatients] = await conn.execute(
    `SELECT patientId FROM patients
     WHERE medicalHistory LIKE ? OR patientNumber LIKE 'DEMO-BR-%'`,
    [`%${DEMO_TAG}%`]
  );
  const patientIds = demoPatients.map((p) => p.patientId);
  if (patientIds.length) {
    const ph = patientIds.map(() => '?').join(',');
    const [inv] = await conn.execute(
      `SELECT invoiceId FROM invoices WHERE patientId IN (${ph}) OR notes LIKE ?`,
      [...patientIds, `%${DEMO_TAG}%`]
    );
    const invoiceIds = inv.map((i) => i.invoiceId);
    if (invoiceIds.length) {
      const iph = invoiceIds.map(() => '?').join(',');
      await conn.execute(`DELETE FROM invoice_items WHERE invoiceId IN (${iph})`, invoiceIds);
      await conn.execute(`DELETE FROM payments WHERE invoiceId IN (${iph})`, invoiceIds).catch(() => {});
      await conn.execute(`DELETE FROM invoices WHERE invoiceId IN (${iph})`, invoiceIds);
    }
    await conn.execute(
      `DELETE FROM telemedicine_sessions WHERE patientId IN (${ph}) OR notes LIKE ?`,
      [...patientIds, `%${DEMO_TAG}%`]
    ).catch(() => {});
    await conn.execute(`DELETE FROM queue_entries WHERE patientId IN (${ph}) OR notes LIKE ?`, [
      ...patientIds,
      `%${DEMO_TAG}%`,
    ]);
    await conn.execute(`DELETE FROM appointments WHERE patientId IN (${ph}) OR notes LIKE ?`, [
      ...patientIds,
      `%${DEMO_TAG}%`,
    ]);
    await conn.execute(`DELETE FROM medical_records WHERE patientId IN (${ph}) OR notes LIKE ?`, [
      ...patientIds,
      `%${DEMO_TAG}%`,
    ]);
    const [rx] = await conn.execute(
      `SELECT prescriptionId FROM prescriptions WHERE patientId IN (${ph}) OR notes LIKE ?`,
      [...patientIds, `%${DEMO_TAG}%`]
    );
    const rxIds = rx.map((r) => r.prescriptionId);
    if (rxIds.length) {
      const rph = rxIds.map(() => '?').join(',');
      await conn.execute(`DELETE FROM prescription_items WHERE prescriptionId IN (${rph})`, rxIds).catch(() => {});
      await conn.execute(`DELETE FROM prescriptions WHERE prescriptionId IN (${rph})`, rxIds);
    }
    await conn.execute(`DELETE FROM lab_test_orders WHERE patientId IN (${ph}) OR notes LIKE ?`, [
      ...patientIds,
      `%${DEMO_TAG}%`,
    ]);
    await conn.execute(`DELETE FROM patients WHERE patientId IN (${ph})`, patientIds);
  }

  await conn.execute(`DELETE FROM drug_inventory WHERE notes LIKE ?`, [`%${DEMO_TAG}%`]);
  await conn.execute(
    `DELETE FROM drug_inventory_transfers WHERE notes LIKE ?`,
    [`%${DEMO_TAG}%`]
  ).catch(() => {});
}

async function nextPatientNumber(conn, branchId, seq) {
  return `DEMO-BR-${branchId}-${String(seq).padStart(3, '0')}`;
}

async function nextDoc(conn, prefix, table, col) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const base = `${prefix}-DEMO-${datePart}-`;
  const [rows] = await conn.execute(
    `SELECT ${col} AS n FROM ${table} WHERE ${col} LIKE ? ORDER BY ${col} DESC LIMIT 1`,
    [`${base}%`]
  );
  let seq = 1;
  if (rows.length) {
    const last = String(rows[0].n || '');
    const parts = last.split('-');
    const n = Number(parts[parts.length - 1]);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${base}${String(seq).padStart(4, '0')}`;
}

async function seedBranch(conn, branch, storeId, people, doctorId, charge, paymentMethodId, meds) {
  const branchId = branch.branchId;
  const createdPatientIds = [];

  for (let i = 0; i < people.length; i += 1) {
    const p = people[i];
    const patientNumber = await nextPatientNumber(conn, branchId, i + 1);
    const dobYear = 1975 + ((i * 3) % 35);
    const [pr] = await conn.execute(
      `INSERT INTO patients (
         registeredBranchId, patientNumber, firstName, lastName, dateOfBirth, gender, patientType,
         phone, address, county, medicalHistory, createdBy, voided
       ) VALUES (?, ?, ?, ?, ?, ?, 'paying', ?, ?, 'Nakuru', ?, 1, 0)`,
      [
        branchId,
        patientNumber,
        p.first,
        p.last,
        `${dobYear}-0${(i % 9) + 1}-15`,
        p.gender,
        p.phone,
        `${branch.branchName} catchment`,
        `${DEMO_TAG} Demo patient registered at ${branch.branchName}`,
      ]
    );
    createdPatientIds.push(pr.insertId);
  }

  // Spread activity across daily, weekly and monthly reporting windows.
  const activityOffsets = [0, 1, 2, 4, 7, 12, 18, 27, 42, 58];
  for (let i = 0; i < createdPatientIds.length; i += 1) {
    const patientId = createdPatientIds[i];
    const dayOffset = activityOffsets[i % activityOffsets.length];
    const visitDate = daysAgo(dayOffset);
    const isPaid = i % 3 !== 0;
    const amount = Number(charge.cost) || 500;
    const paid = isPaid ? amount : i % 2 === 0 ? amount / 2 : 0;
    const status = paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'pending';

    const invoiceNumber = await nextDoc(conn, 'INV', 'invoices', 'invoiceNumber');
    const [ir] = await conn.execute(
      `INSERT INTO invoices (
         branchId, invoiceNumber, patientId, invoiceDate, dueDate, totalAmount, paidAmount, balance,
         status, paymentMethod, notes, createdBy, voided
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        branchId,
        invoiceNumber,
        patientId,
        visitDate,
        visitDate,
        amount,
        paid,
        Math.max(0, amount - paid),
        status,
        isPaid ? 'mpesa' : null,
        `${DEMO_TAG} Consultation invoice @ ${branch.branchName}`,
      ]
    );
    const invoiceId = ir.insertId;
    await conn.execute(
      `INSERT INTO invoice_items (invoiceId, chargeId, description, quantity, unitPrice, totalPrice)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [invoiceId, charge.chargeId, charge.name, amount, amount]
    );

    if (paid > 0 && paymentMethodId) {
      const paymentNumber = await nextDoc(conn, 'PAY', 'payments', 'paymentNumber').catch(async () => {
        // payments.paymentNumber may not exist in all schemas — try without if fails later
        return `PAY-DEMO-${branchId}-${i}`;
      });
      try {
        await conn.execute(
          `INSERT INTO payments
             (branchId, paymentNumber, invoiceId, paymentMethodId, paymentDate, amount, referenceNumber, receivedBy, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            branchId,
            paymentNumber,
            invoiceId,
            paymentMethodId,
            visitDate,
            paid,
            `DEMO-RCPT-${branchId}-${i + 1}`,
            `${DEMO_TAG} Payment @ ${branch.branchName}`,
          ]
        );
      } catch (err) {
        // Fallback without paymentNumber
        await conn.execute(
          `INSERT INTO payments
             (branchId, invoiceId, paymentMethodId, paymentDate, amount, referenceNumber, receivedBy, notes)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            branchId,
            invoiceId,
            paymentMethodId,
            visitDate,
            paid,
            `DEMO-RCPT-${branchId}-${i + 1}`,
            `${DEMO_TAG} Payment @ ${branch.branchName}`,
          ]
        ).catch(() => {});
      }
    }

    // Queue: recent / today activity
    const servicePoints = ['registration', 'triage', 'consultation', 'cashier', 'pharmacy', 'laboratory'];
    const sp = servicePoints[i % servicePoints.length];
    const qStatus = dayOffset === 0 ? (i % 2 === 0 ? 'waiting' : 'completed') : 'completed';
    const arrival = timeToday(8 + (i % 8), (i * 7) % 60);
    await conn.execute(
      `INSERT INTO queue_entries
         (branchId, patientId, ticketNumber, servicePoint, priority, status, arrivalTime, notes, createdBy)
       VALUES (?, ?, ?, ?, 'normal', ?, ?, ?, 1)`,
      [
        branchId,
        patientId,
        `D${branchId}-${String(i + 1).padStart(3, '0')}`,
        sp,
        qStatus,
        dayOffset === 0 ? arrival : new Date(`${visitDate}T09:00:00`),
        `${DEMO_TAG} Queue @ ${branch.branchName}`,
      ]
    );

    const [appointmentResult] = await conn.execute(
      `INSERT INTO appointments
         (branchId, patientId, doctorId, appointmentDate, appointmentTime, department, reason, status, notes, createdBy)
       VALUES (?, ?, ?, ?, '10:00:00', 'Outpatient', ?, ?, ?, 1)`,
      [
        branchId,
        patientId,
        doctorId,
        visitDate,
        `${DEMO_TAG} Follow-up`,
        dayOffset <= 1 ? 'scheduled' : 'completed',
        `${DEMO_TAG} Appointment @ ${branch.branchName}`,
      ]
    );

    // Believable branch-attributed teleconsultation activity. Every seeded
    // branch has sessions today, this week and this month; larger branches
    // also contain older history.
    const startedAt = new Date(`${visitDate}T10:${String(5 + (i % 4) * 5).padStart(2, '0')}:00`);
    const isActiveTelemedicine = i === 0;
    const endedAt = isActiveTelemedicine
      ? null
      : new Date(startedAt.getTime() + (18 + (i % 5) * 7) * 60 * 1000);
    // Keep the seed compatible with both the original provider enum and the
    // expanded provider migration.
    const provider = ['daily', 'zoom_manual'][i % 2];
    const [telemedicineResult] = await conn.execute(
      `INSERT INTO telemedicine_sessions
         (sessionUuid, originType, appointmentId, admissionId, queueEntryId, branchId,
          provider, patientId, doctorId, status, startedAt, endedAt,
          patientConsentGranted, patientConsentAt, patientConsentBy,
          recordingConsentSatisfiedAt, notes, createdBy, createdAt, updatedAt)
       VALUES (?, 'appointment', ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?,
               1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        appointmentResult.insertId,
        branchId,
        provider,
        patientId,
        doctorId,
        isActiveTelemedicine ? 'in_progress' : 'ended',
        startedAt,
        endedAt,
        new Date(startedAt.getTime() - 5 * 60 * 1000),
        doctorId,
        new Date(startedAt.getTime() - 5 * 60 * 1000),
        `${DEMO_TAG} Telemedicine consultation @ ${branch.branchName}`,
        doctorId,
        new Date(startedAt.getTime() - 10 * 60 * 1000),
        endedAt || startedAt,
      ]
    );
    await conn.execute(
      `INSERT INTO telemedicine_session_audit
         (sessionId, eventType, actorUserId, eventAt, details)
       VALUES (?, 'teleconsult_started', ?, ?, ?)`,
      [
        telemedicineResult.insertId,
        doctorId,
        startedAt,
        `${DEMO_TAG} ${provider} consultation started`,
      ]
    );
    if (endedAt) {
      await conn.execute(
        `INSERT INTO telemedicine_session_audit
           (sessionId, eventType, actorUserId, eventAt, details)
         VALUES (?, 'call_ended', ?, ?, ?)`,
        [
          telemedicineResult.insertId,
          doctorId,
          endedAt,
          `${DEMO_TAG} consultation completed`,
        ]
      );
    }

    await conn.execute(
      `INSERT INTO medical_records
         (branchId, patientId, visitDate, visitType, department, chiefComplaint, diagnosis, treatment, doctorId, notes, createdBy)
       VALUES (?, ?, ?, 'Outpatient', 'Outpatient', ?, ?, ?, ?, ?, 1)`,
      [
        branchId,
        patientId,
        visitDate,
        i % 2 === 0 ? 'Fever and cough' : 'Hypertension review',
        i % 2 === 0 ? 'Upper respiratory tract infection' : 'Essential hypertension',
        i % 2 === 0 ? 'Supportive care + paracetamol' : 'Continue antihypertensives',
        doctorId,
        `${DEMO_TAG} Encounter @ ${branch.branchName}`,
      ]
    );

    const rxNumber = await nextDoc(conn, 'RX', 'prescriptions', 'prescriptionNumber');
    const med = meds[i % meds.length];
    const [rxr] = await conn.execute(
      `INSERT INTO prescriptions
         (branchId, prescriptionNumber, patientId, doctorId, prescriptionDate, status, notes, createdBy)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, 1)`,
      [branchId, rxNumber, patientId, doctorId, visitDate, `${DEMO_TAG} Rx @ ${branch.branchName}`]
    );
    await conn.execute(
      `INSERT INTO prescription_items
         (prescriptionId, medicationId, medicationName, dosage, frequency, duration, quantity, instructions, status)
       VALUES (?, ?, ?, '1 tab', 'TDS', '5 days', 15, 'After meals', 'pending')`,
      [rxr.insertId, med.medicationId, med.name]
    );

    if (i % 2 === 0) {
      const labNumber = await nextDoc(conn, 'LAB', 'lab_test_orders', 'orderNumber');
      await conn.execute(
        `INSERT INTO lab_test_orders
           (branchId, orderNumber, patientId, orderedBy, orderDate, priority, clinicalIndication, status, notes)
         VALUES (?, ?, ?, ?, ?, 'routine', ?, 'pending', ?)`,
        [
          branchId,
          labNumber,
          patientId,
          doctorId,
          visitDate,
          `${DEMO_TAG} Lab workup`,
          `${DEMO_TAG} Lab order @ ${branch.branchName}`,
        ]
      );
    }
  }

  // Stock at this branch store
  for (let m = 0; m < Math.min(4, meds.length); m += 1) {
    const med = meds[m];
    const qty = 80 + branchId * 10 + m * 15;
    await conn.execute(
      `INSERT INTO drug_inventory
         (branchId, medicationId, batchNumber, quantity, originalQuantity, status, unitPrice, sellPrice,
          expiryDate, location, storeId, notes)
       VALUES (?, ?, ?, ?, ?, 'active', 10.00, 25.00, DATE_ADD(CURDATE(), INTERVAL 18 MONTH), ?, ?, ?)`,
      [
        branchId,
        med.medicationId,
        `DEMO-B${branchId}-M${med.medicationId}-${Date.now().toString(36).slice(-4)}`,
        qty,
        qty,
        branch.branchName,
        storeId,
        `${DEMO_TAG} Stock @ ${branch.branchName}`,
      ]
    );
  }

  return { patients: createdPatientIds.length, telemedicineSessions: createdPatientIds.length, storeId };
}

async function seedTransfer(conn, fromStoreId, toStoreId, medicationId, qty) {
  const transferNumber = await nextDoc(conn, 'TRF', 'drug_inventory_transfers', 'transferNumber');
  const [batches] = await conn.execute(
    `SELECT drugInventoryId, batchNumber, unitPrice FROM drug_inventory
     WHERE storeId = ? AND medicationId = ? AND quantity >= ? AND notes LIKE ?
     ORDER BY drugInventoryId DESC LIMIT 1`,
    [fromStoreId, medicationId, qty, `%${DEMO_TAG}%`]
  );
  if (!batches.length) return null;
  const b = batches[0];
  await conn.execute(
    `INSERT INTO drug_inventory_transfers
       (transferNumber, fromStoreId, toStoreId, medicationId, drugInventoryId, batchNumber, quantity, unitPrice,
        transferDate, status, requestedBy, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'pending', 1, ?)`,
    [
      transferNumber,
      fromStoreId,
      toStoreId,
      medicationId,
      b.drugInventoryId,
      b.batchNumber,
      qty,
      b.unitPrice || 10,
      `${DEMO_TAG} Cross-facility transfer request`,
    ]
  );
  return transferNumber;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    console.log('==> Cleaning previous BRANCH-DEMO data…');
    await cleanupPreviousDemo(conn);

    const branches = await ensureBranches(conn);
    console.log(
      '==> Branches:',
      branches.map((b) => `${b.branchId}:${b.branchName}`).join(', ')
    );

    const main = branches.find((b) => b.isMainBranch) || branches[0];
    const satellites = branches.filter((b) => Number(b.branchId) !== Number(main.branchId));

    // Ensure stores
    const storeByBranch = {};
    for (const b of branches) {
      if (Number(b.branchId) === Number(main.branchId)) {
        const [rows] = await conn.execute(
          `SELECT storeId FROM drug_stores WHERE branchId = ? AND isActive = 1 ORDER BY isDispensingStore DESC LIMIT 1`,
          [b.branchId]
        );
        storeByBranch[b.branchId] = rows[0]?.storeId || (await ensureStore(conn, b.branchId, 'STORE-MAIN', 'Main Store', false));
      } else {
        const code = `STORE-BR${b.branchId}`;
        const name = `${String(b.branchName).trim()} Dispensary`;
        storeByBranch[b.branchId] = await ensureStore(conn, b.branchId, code, name, true);
      }
    }

    const [charges] = await conn.execute(
      `SELECT chargeId, name, cost FROM service_charges WHERE status = 'Active' ORDER BY chargeId LIMIT 1`
    );
    if (!charges.length) throw new Error('No active service_charges found');
    const charge = charges[0];

    const [pms] = await conn.execute(
      `SELECT methodId FROM payment_methods WHERE isActive = 1 ORDER BY methodId LIMIT 1`
    );
    const paymentMethodId = pms[0]?.methodId || null;

    const [docs] = await conn.execute(
      `SELECT u.userId FROM users u
       LEFT JOIN roles r ON u.roleId = r.roleId
       WHERE COALESCE(u.voided,0)=0
       ORDER BY CASE WHEN LOWER(COALESCE(r.roleName,'')) LIKE '%doctor%' THEN 0 ELSE 1 END, u.userId
       LIMIT 1`
    );
    const doctorId = docs[0]?.userId || 1;

    const [meds] = await conn.execute(
      `SELECT medicationId, name FROM medications WHERE COALESCE(voided,0)=0 ORDER BY medicationId LIMIT 6`
    );
    if (!meds.length) throw new Error('No medications found');

    const summary = [];
    for (const b of satellites) {
      const people = DEMO_PATIENTS[b.branchId] || DEMO_PATIENTS[3].map((p, idx) => ({
        ...p,
        first: `${p.first}${b.branchId}`,
        phone: `07${b.branchId}${String(1000000 + idx).slice(-7)}`,
      }));
      const result = await seedBranch(
        conn,
        b,
        storeByBranch[b.branchId],
        people,
        doctorId,
        charge,
        paymentMethodId,
        meds
      );
      summary.push({
        branchId: b.branchId,
        branchName: b.branchName,
        patients: result.patients,
        telemedicineSessions: result.telemedicineSessions,
        storeId: result.storeId,
      });
    }

    // Also add a few main-branch demo patients so comparison charts have "today" activity on main
    const mainPeople = [
      { first: 'Samuel', last: 'Maina', gender: 'Male', phone: '0700111001' },
      { first: 'Faith', last: 'Wairimu', gender: 'Female', phone: '0700111002' },
      { first: 'George', last: 'Kamau', gender: 'Male', phone: '0700111003' },
      { first: 'Hellen', last: 'Akinyi', gender: 'Female', phone: '0700111004' },
    ];
    const mainResult = await seedBranch(
      conn,
      main,
      storeByBranch[main.branchId],
      mainPeople,
      doctorId,
      charge,
      paymentMethodId,
      meds
    );
    summary.push({
      branchId: main.branchId,
      branchName: main.branchName,
      patients: mainResult.patients,
      telemedicineSessions: mainResult.telemedicineSessions,
      storeId: mainResult.storeId,
    });

    // Cross-facility transfer: main → first satellite
    if (satellites.length && meds.length) {
      const trf = await seedTransfer(
        conn,
        storeByBranch[main.branchId],
        storeByBranch[satellites[0].branchId],
        meds[0].medicationId,
        20
      );
      console.log('==> Demo transfer:', trf || '(skipped)');
    }

    // Ensure admin can access all branches
    const [admins] = await conn.execute(
      `SELECT u.userId FROM users u
       LEFT JOIN roles r ON u.roleId = r.roleId
       WHERE LOWER(COALESCE(r.roleName,'')) LIKE '%admin%' AND COALESCE(u.voided,0)=0`
    );
    for (const a of admins) {
      for (const b of branches) {
        await conn.execute(
          `INSERT INTO user_branch_assignments (userId, branchId, isDefault, canAccessAllBranches, isActive)
           VALUES (?, ?, ?, 1, 1)
           ON DUPLICATE KEY UPDATE canAccessAllBranches = 1, isActive = 1`,
          [a.userId, b.branchId, Number(b.branchId) === Number(main.branchId) ? 1 : 0]
        );
      }
    }

    await conn.commit();
    console.log('==> Seed complete');
    console.log(JSON.stringify({ ok: true, demoTag: DEMO_TAG, summary }, null, 2));
  } catch (err) {
    await conn.rollback();
    console.error('Seed failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    conn.release();
    process.exit(process.exitCode || 0);
  }
}

main();
