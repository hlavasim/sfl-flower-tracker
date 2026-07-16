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
            schema: { type: "string", enum: ["constants", "cooking", "openapi"], default: "cooking" },
            description:
              "Which computation to run. `constants`: the canonical core/data game tables " +
              "plus flowers.html migration-coverage status, no farm needed. `cooking`: " +
              "per-building cooking XP/time/cost for the given farm. `openapi`: this " +
              "document, no farm needed. Defaults to `cooking` when omitted.",
          },
          {
            name: "farm",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "Sunflower Land farm ID. Required for data sections (currently `cooking`); " +
              "NOT required for `constants` or `openapi`, whose branches run before the " +
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
            name: "petSimulate",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["1"] },
            description:
              "Set to \"1\" to simulate an active pet-streak XP multiplier (×1.5) " +
              "regardless of the farm's real streak state. Any other value (or absence) " +
              "leaves the real streak state in effect.",
          },
        ],
        responses: {
          200: {
            description:
              "Section payload. Shape depends on `section`: data sections include `farm` " +
              "and `computedAt`; `constants`/`openapi` omit `farm`.",
            content: {
              "application/json": {
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
