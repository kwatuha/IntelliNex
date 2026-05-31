/**
 * Creates telemedicine_sessions + telemedicine_session_audit (Zoom link mode).
 * Uses DB_* from api/.env — same as the API server.
 *
 * Usage (from api/):
 *   npm run migrate:telemedicine
 *
 * Or manually:
 *   mysql -u USER -p kiplombe_hmis < database/migrations/40_telemedicine_sessions_schema.sql
 *   … then 41, 42, 43, 49 as needed (49 adds Meet/Teams/other provider enum values)
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('../config/load-env');
const { resolveDbHost } = require('../config/resolve-db-host');

async function run() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: resolveDbHost(),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kiplombe_hmis',
      port: Number(process.env.DB_PORT) || 3306,
      multipleStatements: true,
    });

    const dbName = process.env.DB_NAME || 'kiplombe_hmis';
    console.log(`Connected to ${dbName}`);

    const sql40 = fs.readFileSync(
      path.join(__dirname, '../database/migrations/40_telemedicine_sessions_schema.sql'),
      'utf8'
    );
    console.log('Running 40_telemedicine_sessions_schema.sql ...');
    await connection.query(sql40);
    console.log('✅ Telemedicine tables created (or already present).');

    const sql41 = fs.readFileSync(
      path.join(__dirname, '../database/migrations/41_telemedicine_zoom_manual.sql'),
      'utf8'
    );
    console.log('Running 41_telemedicine_zoom_manual.sql (optional column upgrades) ...');
    await connection.query(sql41);

    const sql42 = fs.readFileSync(
      path.join(__dirname, '../database/migrations/42_user_telemedicine_defaults.sql'),
      'utf8'
    );
    console.log('Running 42_user_telemedicine_defaults.sql ...');
    await connection.query(sql42);

    const sql43 = fs.readFileSync(
      path.join(__dirname, '../database/migrations/43_telemedicine_standalone_origin.sql'),
      'utf8'
    );
    console.log('Running 43_telemedicine_standalone_origin.sql (originType enum) ...');
    await connection.query(sql43);

    const sql43q = fs.readFileSync(
      path.join(__dirname, '../database/migrations/43_telemedicine_queue_origin.sql'),
      'utf8'
    );
    console.log('Running 43_telemedicine_queue_origin.sql (queueEntryId + index) ...');
    await connection.query(sql43q);

    const sql49 = fs.readFileSync(
      path.join(__dirname, '../database/migrations/49_telemedicine_video_providers.sql'),
      'utf8'
    );
    console.log('Running 49_telemedicine_video_providers.sql (Zoom/Meet/Teams provider enum) ...');
    await connection.query(sql49);
    console.log('✅ Done (telemedicine + queue origin + video providers).');
  } catch (error) {
    console.error('❌ Migration failed:', error.message || error.code || error);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('Check DB_USER / DB_PASSWORD in api/.env');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('Create the database first or set DB_NAME in .env');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('Cannot reach MySQL. Check DB_HOST / DB_PORT and that the server is running.');
    }
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

run();
