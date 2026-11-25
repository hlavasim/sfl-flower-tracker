import pg from "pg";

let pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: 5432,
      // The server certificate is verified (Azure's chain is in Node's default CAs, checked
      // 2026-11-25); PGSSL_VERIFY=false is the escape hatch should that ever change.
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: process.env.PGSSL_VERIFY !== "false" } : false,
      // Few connections, released fast, and nothing waits forever: 3 per warm instance held 30 s with
      // no timeouts is what exhausted the server's connection slots.
      max: 2,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 20000,
    });
    // An idle client dropped by the server emits here; unhandled, it would crash the function.
    pool.on("error", (e) => console.error("[pg pool]", e.message));
  }
  return pool;
}
