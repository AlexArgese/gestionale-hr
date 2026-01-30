const { Pool } = require('pg');
require('dotenv').config();

// Preferisci DATABASE_URL (Neon/Render) se presente
const hasDbUrl = !!process.env.DATABASE_URL;

const pool = hasDbUrl
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon richiede SSL
    })
  : new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      database: process.env.PGDATABASE,
    });

module.exports = pool;
