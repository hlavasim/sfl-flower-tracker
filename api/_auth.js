import { createHash, timingSafeEqual } from "crypto";

/*
 * Owner-only gate for every write (and the few owner-private reads) in api/.
 *
 * The farm ID was the only check before, and it is public — anyone, from any site (CORS is *),
 * could rewrite the BTC ledger or read the wallet address. The page sends the token from
 * localStorage as `x-write-token`; the local egg collector sends it from a file.
 *
 * Both sides are hashed before the compare so timingSafeEqual gets equal lengths and the
 * token's length does not leak either. No WRITE_TOKEN configured means writes are OFF (503),
 * never open — a missing env var must not silently restore the old behaviour.
 *
 * Returns true when the request may proceed; otherwise it has already answered and the caller
 * just returns.
 */
const digest = (s) => createHash("sha256").update(String(s)).digest();

export function requireWriteToken(req, res) {
  const expected = process.env.WRITE_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "writes disabled: WRITE_TOKEN not configured" });
    return false;
  }
  let got = (req.headers || {})["x-write-token"];
  if (Array.isArray(got)) got = got[0];
  if (typeof got !== "string" || !got || !timingSafeEqual(digest(got), digest(expected))) {
    res.status(401).json({ error: "write token required" });
    return false;
  }
  return true;
}
