// A stand-in for a pg Pool: every query (pool or client) goes to `answer(sql, params)`, which
// returns rows (an array) or a full { rows, rowCount } result. All calls are recorded in
// `calls` so a test can assert what SQL ran. Not a test file itself (no .test. in the name).
export function fakePool(answer = () => []) {
  const calls = [];
  const run = async (sql, params) => {
    const text = typeof sql === "string" ? sql : sql.text;
    calls.push({ sql: text, params });
    const out = await answer(text, params || []);
    if (Array.isArray(out)) return { rows: out, rowCount: out.length };
    return { rows: [], rowCount: 0, ...(out || {}) };
  };
  return {
    calls,
    query: run,
    connect: async () => ({ query: run, release() {} }),
    sqlMatching(re) { return calls.filter((c) => re.test(c.sql)); },
  };
}

export function mockRes() {
  return {
    _status: 200, _json: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this._status = c; return this; },
    json(o) { this._json = o; return this; },
    end() { return this; },
  };
}

// A context object shaped like the Azure Functions one the collectors log through.
export function fakeContext() {
  const lines = [];
  const log = (...a) => lines.push(["info", a.join(" ")]);
  log.warn = (...a) => lines.push(["warn", a.join(" ")]);
  log.error = (...a) => lines.push(["error", a.join(" ")]);
  return { log, lines };
}
