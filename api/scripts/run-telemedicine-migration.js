/**
 * Applies telemedicine schema + experience-pack role migrations.
 * Uses DB_* from api/.env — same as the API server.
 *
 * Usage (from api/):
 *   npm run migrate:telemedicine
 *
 * Or manually:
 *   mysql -u USER -p kiplombe_hmis < database/migrations/40_telemedicine_sessions_schema.sql
 *   … then 41, 42, 43, 49, 67, 68, 69 as needed
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('../config/load-env');
const { resolveDbHost } = require('../config/resolve-db-host');

const MIGRATIONS = [
  '40_telemedicine_sessions_schema.sql',
  '41_telemedicine_zoom_manual.sql',
  '42_user_telemedicine_defaults.sql',
  '43_telemedicine_standalone_origin.sql',
  '43_telemedicine_queue_origin.sql',
  '49_telemedicine_video_providers.sql',
  '67_telemedicine_metrics.sql',
  '68_nurse_triage_telemedicine_menu.sql',
  '69_telemedicine_clinician_role.sql',
];

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

    for (const file of MIGRATIONS) {
      const fullPath = path.join(__dirname, '../database/migrations', file);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Missing migration file: ${fullPath}`);
      }
      console.log(`Running ${file} ...`);
      const sql = fs.readFileSync(fullPath, 'utf8');
      await connection.query(sql);
    }

    console.log('✅ Done (telemedicine schema + metrics + nurse menu + telemedicine_clinician role).');
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
