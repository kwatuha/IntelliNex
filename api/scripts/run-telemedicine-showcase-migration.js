/**
 * Applies telemedicine showcase menu/landing pack (hide non-TM modules).
 * Usage (from api/): npm run migrate:telemedicine-showcase
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('../config/load-env');
const { resolveDbHost } = require('../config/resolve-db-host');

const FILE = '70_telemedicine_showcase_pack.sql';

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

    const fullPath = path.join(__dirname, '../database/migrations', FILE);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing migration file: ${fullPath}`);
    }
    console.log(`Connected to ${process.env.DB_NAME || 'kiplombe_hmis'}`);
    console.log(`Running ${FILE} ...`);
    await connection.query(fs.readFileSync(fullPath, 'utf8'));
    console.log('✅ Done (telemedicine showcase pack).');
  } catch (error) {
    console.error('❌ Showcase migration failed:', error.message || error.code || error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

run();
