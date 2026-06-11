const { Pool } = require('pg');
require('dotenv').config();

const hasDbUrl = !!process.env.DATABASE_URL;

const pool = hasDbUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      database: process.env.PGDATABASE,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

// Evita crash del processo quando Neon termina connessioni idle (57P01 admin_shutdown)
pool.on('error', (err, client) => {
  console.error('[pool] errore connessione idle:', err.message);
});

module.exports = pool;
