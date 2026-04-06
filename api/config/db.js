// Database connection configuration
require('./load-env');
const mysql = require('mysql2/promise');
const { resolveDbHost } = require('./resolve-db-host');

const pool = mysql.createPool({
    host: resolveDbHost(),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kiplombe_hmis',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    // Higher limit reduces waits when many routes hold connections; tune via env if needed
    connectionLimit: Number(process.env.DB_POOL_SIZE || 20),
    // Cap queue so clients fail fast instead of hanging indefinitely when pool is saturated
    queueLimit: Number(process.env.DB_POOL_QUEUE_LIMIT || 50),
    charset: 'utf8mb4'
});

// Test the connection pool
pool.getConnection()
  .then(connection => {
    console.log('MySQL connection pool created successfully!');
    connection.release();
  })
  .catch(err => {
    console.error('Warning: Initial database connection test failed:', err.message);
    console.error('The application will continue to run. Database connections will be retried when needed.');
  });

module.exports = pool;

