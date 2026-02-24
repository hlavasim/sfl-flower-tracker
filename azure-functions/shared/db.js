const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: 5432,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
      max: 3,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

module.exports = { getPool };
