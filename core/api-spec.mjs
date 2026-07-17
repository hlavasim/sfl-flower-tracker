// The OpenAPI 3.1 contract for GET /api/compute, hand-written (no npm validator — see
// task-14a brief: repo has one dependency, `pg`). Pinned to the real handler by
// tests/core/api-spec.test.mjs, which diffs this document's section enum and parameter
// list against `section === "..."` / `req.query.X` occurrences scraped straight out of
// api/compute.mjs. If this file and the handler disagree, that test fails — keep them
// in lockstep rather than "fixing" the test.
export const API_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "SFL Flower Tracker — compute API",
    version: "1.0.0",
    description:
      "Server-side game-economy compute layer for the SFL Flower Tracker. GET-only, " +
      "read-only (no state is mutated on the server) and requires no authentication. " +
      "Exists so the economy math is callable by any external consumer that cannot run " +
      "the app's client-side JS, not only the app's own DOM-based frontend.",
  },
  servers: [{ url: "https://sunflower.sajmonium.quest" }],
  paths: {
    "/api/compute": {
      get: {
        summary: "Compute a section of derived game data for a Sunflower Land farm.",
        description:
          "`section` selects which computation runs. `constants` and `openapi` describe " +
          "the API/game tables themselves and need no `farm`; every other section computes " +
          "against a specific farm's live state and requires `farm`.",
        parameters: [
          {
            name: "section",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["constants", "cooking", "openapi", "prices"], default: "cooking" },
            description:
              "Which computation to run. `constants`: the canonical core/data game tables " +
              "plus flowers.html migration-coverage status, no farm needed. `cooking`: " +
              "per-building cooking XP/time/cost for the given farm. `prices`: precomputed " +
              "item-value maps for the given farm — `marketValue` (what an item is WORTH: " +
              "market price first, derived only when the market has none; farm-independent) " +
              "and `productionCost` (what it costs YOU to make: e.g. Salt is derived from " +
              "the Salt Rake's cost and deliberately ignores its market price, so this map " +
              "is per-farm — it depends on skills and salt/fish yield). An item neither can " +
              "price is ABSENT from that map rather than `0`, so a consumer can tell " +
              "\"unpriced\" from \"free\". `openapi`: this " +
              "document, no farm needed. Defaults to `cooking` when omitted.",
          },
          {
            name: "farm",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Sunflower Land farm ID. Required for data sections (currently `cooking` and " +
              "`prices`); NOT required for `constants` or `openapi`, whose branches run before the " +
              "farm-required guard. Omitting it for a section that needs it returns 400.",
          },
          {
            name: "coinsPerSFL",
            in: "query",
            required: false,
            schema: { type: "number" },
            description:
              "Optional override for the coins-per-SFL exchange rate used to price " +
              "coin-costed recipe ingredients. When absent, the server derives the Betty " +
              "rate from live sfl.world P2P prices instead.",
          },
          {
            name: "recipes",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "URL-encoded JSON object mapping building name to the selected recipe name " +
              "for that building, e.g. `{\"Fire Pit\":\"Pizza Margherita\"}`. Any building " +
              "omitted from the map falls back to BUMPKIN_DEFAULT_RECIPES. Absent entirely " +
              "→ BUMPKIN_DEFAULT_RECIPES is used for every building.",
          },
          {
            name: "rates",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "URL-encoded JSON object of rate-profile overrides, forwarded verbatim to " +
              "the item-value resolver for `section=prices` — e.g. " +
              "`{\"coinsPerSFL\":1061,\"sflPerXP\":0.0001,\"treasureBoost\":1.2,\"gemsPerSFL\":4000,\"season\":\"summer\"}`. " +
              "Exists because different consumers legitimately need different profiles: " +
              "some pass no rates at all, others pass only coinsPerSFL/gemsPerSFL, others " +
              "the full set — and the resulting values differ (e.g. treasure items scale " +
              "by `treasureBoost`, and some fish are only priceable once `sflPerXP` is " +
              "given). Any key also matches a field `coinsPerSFL` derives server-side " +
              "(below) overrides it. Absent or unparseable → falls back to `{}`, so " +
              "omitting it reproduces the map exactly as when this parameter did not " +
              "exist.",
          },
          {
            name: "petSimulate",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["1"] },
            description:
              "Set to \"1\" to simulate an active pet-streak XP multiplier (×1.5) " +
              "regardless of the farm's real streak state. Any other value (or absence) " +
              "leaves the real streak state in effect.",
          },
          {
            name: "explain",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["1"] },
            description:
              "`1` attaches per-item derivation traces to section=prices; off by default. " +
              "When set, the response's `data` also carries `marketTrace`/`productionTrace` " +
              "— maps keyed by item name, each value a trace node `{item, method, formula, " +
              "value, steps?}` describing how that item's `marketValue`/`productionCost` " +
              "entry was derived, produced by the SAME resolver call that computed the map " +
              "value (so the trace's `value` always equals the map's). Bounded to DERIVED " +
              "items (`method !== \"market price\"`) — a bare market lookup needs no " +
              "explanation. Ignored by every other section. Any value other than \"1\", or " +
              "omitting it, reproduces today's payload with no trace keys at all.",
          },
        ],
        responses: {
          200: {
            description:
              "The response shape depends on `section` — there are THREE, and they are not " +
              "variations of one envelope:\n" +
              "- `section=cooking` and `section=prices` → `{ farm, computedAt, section, data }`. " +
              "`section=prices` additionally carries `pricesOk: boolean` — false when the " +
              "server's own upstream P2P prices fetch failed and `data.marketValue` is " +
              "therefore near-empty (best-effort, not a 4xx/5xx); true when it loaded.\n" +
              "- `section=constants` → `{ computedAt, section, data }` — no `farm` (it needs none).\n" +
              "- `section=openapi` → **this document itself, unwrapped**: top-level `openapi`, " +
              "`info`, `servers`, `paths`. There is NO `data`/`section`/`computedAt` key — reading " +
              "`.data` gives `undefined`. It is served raw because a Swagger UI `url:` must resolve " +
              "to the OpenAPI document itself.",
            content: {
              "application/json": {
                // Deliberately unconstrained: the three shapes above differ at the top level, and
                // OpenAPI cannot key a schema off a query parameter's value. The prose is the
                // contract here — keep it accurate. (An earlier wording said constants/openapi
                // merely "omit farm", which was true word-by-word and still misled: it implied
                // openapi keeps the envelope. It does not.)
                schema: { type: "object" },
                examples: {
                  cooking: {
                    summary: "section=cooking",
                    value: {
                      farm: "155498",
                      computedAt: "2026-07-16T00:00:00.000Z",
                      section: "cooking",
                      data: {
                        totalXpPerDay: 1278649.777,
                        buildings: {
                          "Fire Pit": {
                            recipe: "Mashed Potato",
                            cookMinutes: 0.5,
                            xpPerCook: 3,
                            buildingCount: 1,
                            xpPerDay: 232509.8,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description:
              "`farm` was required for the requested section but missing, or `section` is " +
              "not a recognized value.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                  required: ["error"],
                },
                examples: {
                  farmRequired: { summary: "missing farm", value: { error: "farm required" } },
                  unknownSection: {
                    summary: "unrecognized section",
                    value: { error: "unknown section: nope" },
                  },
                },
              },
            },
          },
          502: {
            description:
              "The upstream Sunflower Land farm API fetch failed. It rate-limits " +
              "aggressively, so this most commonly surfaces as a 429.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                  required: ["error"],
                },
                examples: {
                  rateLimited: {
                    summary: "upstream rate limit",
                    value: { error: "farm fetch failed: 429" },
                  },
                },
              },
            },
          },
          500: {
            description: "Unexpected server error while computing the section.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                  required: ["error"],
                },
              },
            },
          },
        },
      },
    },
  },
};
