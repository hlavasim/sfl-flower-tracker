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
      // dev-server.mjs sets PG_POOL_MAX=1 so local work holds one production connection at most.
      max: Math.min(2, Number(process.env.PG_POOL_MAX) || 2),
      idleTimeoutMillis: 5000,
      // Also the wait for a free pool slot: dev-server.mjs raises it so a page's reads queue for its one connection.
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 5000,
      statement_timeout: 20000,
    });
    // An idle client dropped by the server emits here; unhandled, it would crash the function.
    pool.on("error", (e) => console.error("[pg pool]", e.message));
  }
  return pool;
}
