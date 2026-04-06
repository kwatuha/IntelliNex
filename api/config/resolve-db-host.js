const fs = require('fs');

/**
 * MySQL host for mysql2. Inside a container, `localhost` is the container itself (no mysqld),
 * and Node often resolves it to ::1 — use the Docker Compose MySQL service name when DB_HOST
 * is unset or empty.
 */
function resolveDbHost() {
  const raw = process.env.DB_HOST;
  if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  if (fs.existsSync('/.dockerenv')) return 'db';
  return 'localhost';
}

module.exports = { resolveDbHost };
