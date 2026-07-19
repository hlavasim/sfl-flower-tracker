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
            schema: { type: "string", enum: ["buds", "constants", "cooking", "diff", "eff", "openapi", "pets", "power", "prices", "roadmap", "roi", "treasury"], default: "cooking" },
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
              "\"unpriced\" from \"free\". `diff`: POST-only — VALUES a batch of already-fetched " +
              "farm-snapshot delta maps (from /api/farm-history or /api/farm-diff-agg) into " +
              "per-item SFL contributions + a net total, using the `marketValue` map priced " +
              "with the posted `rates`. Body: `{ snapshots: [{ diff }, ...] }`; response " +
              "`data.snapshots[]` carries `{ netSfl, items }` (+ a `trace` when `explain=1`). " +
              "`power`: the POWER/ROADMAP pages' shared boost state for the given farm — " +
              "`boostItems` (every boost collectible/wearable/skill with parsed effects, " +
              "categories, floor price and ownership), `capacity` (per-category plot/node/animal " +
              "counts), `p2pPrices` (incl. the derived Oil price), `skillCostInfo`, " +
              "`exchangeRates` (Betty coins rate + gems + USD), `stockMods`, `season`, " +
              "`categories` (per-category production + cost summary — the page's former " +
              "renderPowerContent pipeline: base/boosted SFL/day, seed/tool/feed/sickness " +
              "costs, honoring the `products` selections), `boostValues` (per-boost-per-category " +
              "solo/synergy/ROI from the roadmap engine; roi Infinity → null on the wire), and " +
              "a slim `nftData` ({collectibles, wearables} with name/floor/boost_text/supply). Fetches the sfl.world NFT " +
              "list server-side; a failed NFT fetch is a 502 like a failed farm fetch. " +
              "`roi`: the ROI-vs-login-frequency page's state — its own boost-item list " +
              "(with quantCats/isSellable flags), `pets`, `capacity`, `p2pPrices`, `sflUsd`, " +
              "`btcUsd` (coingecko, best-effort 0), `exchangeRates`, `stockMods`, `season`, and " +
              "`rowsByLogins` (the page's per-category keep-vs-sell rows precomputed for all " +
              "four login frequencies; non-finite roiYears → null on the wire). " +
              "Same NFT-fetch 502 semantics as `power`. " +
              "`buds`: SFL/day valuation of all 2621 bud NFTs against the farm's capacity " +
              "(rows: id/type/stem/aura/owned/sflPerDay/breakdown; `products` query param " +
              "overrides the per-category product like the page's selector). " +
              "`pets`: the pet advisor's per-pet daily economics (level, energy, best fetch, " +
              "SFL/day) + feed boosts + the raw p2p price map its tables use. " +
              "`eff`: POST-only — measured harvest efficiency per category from farm-history " +
              "snapshot rows the client posts (body `{ snapshots: [{ captured_at, diff }] }`); " +
              "returns `{ effByCat, meta, meanRatio }` with theoretical cycles from the same " +
              "boosted engine as `power`. " +
              "`treasury`: full-farm liquidation valuation — `td` (nft floors + p2p + coin/gem/" +
              "USD/BTC rates) and `value` (computeFarmValue: resources/treasures/collectibles/" +
              "wearables/pets/listings/liquid + totals) for the requested `coinMode`. " +
              "`roadmap`: POST-only — the roadmap page's computed layer: measured efficiency " +
              "(body `{ snapshots }` like `eff`), `currentProd` (net income by category at " +
              "real efficiency), and `sim` (the reinvestment-ordered buy path: timeline, " +
              "ranked list, core/cosmetic/tail splits; non-finite roi/atDay → null). Honors " +
              "the `roadmap` and `products` query params. " +
              "`openapi`: this document, no farm needed. Defaults to `cooking` when omitted.",
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
            name: "products",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "URL-encoded JSON object mapping power-category id to the selected product " +
              "name (e.g. `{\"crops\":\"Kale\"}`), used by `section=buds` and `section=power` (its `categories` block) to price " +
              "product-specific boosts the way the page's product selectors do. Any " +
              "category omitted falls back to that category's default product. Ignored " +
              "by other sections.",
          },
          {
            name: "formulaFor",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "section=power only: name of ONE boost item whose expandable derivation " +
              "panel to compute — the response gains `data.formulaHtml` (the page's " +
              "formula explainer, rendered server-side). Absent → no panel is computed.",
          },
          {
            name: "formulaCat",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "section=power only: the category the requested formula panel is opened " +
              "under (a power category id, or `qual` for the qualitative list). Used " +
              "with `formulaFor`.",
          },
          {
            name: "coinMode",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["betty", "api", "off"] },
            description:
              "section=treasury only: which coins→SFL rate values the coin balance — " +
              "`betty` (best crop sale, default), `api` (exchange tier), anything else = 0.",
          },
          {
            name: "petprices",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "section=treasury only: URL-encoded JSON of user-entered NFT pet purchase " +
              "prices keyed `nft-<id>` (the page's localStorage sfl_pet_prices_v1); a pet " +
              "without an entry is valued at the flat 2000 fallback.",
          },
          {
            name: "multicat",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "URL-encoded JSON mapping multi-category NFT name → the category its sale " +
              "value is attributed to (the roi page's localStorage assignment), consumed " +
              "by `section=roi`'s precomputed rows. Absent → each NFT's first quantifiable " +
              "category. Ignored by other sections.",
          },
          {
            name: "roadmap",
            in: "query",
            required: false,
            schema: { type: "string" },
            description:
              "URL-encoded JSON of the client's roadmap settings (the page's localStorage " +
              "`sfl_roadmap_settings`), consumed by `section=power`'s boostValues engine — " +
              "marketFee, coinsFree, miningCostMode, excludeCats etc. shift per-boost " +
              "valuations. Absent or unparseable → defaults (a fresh browser). Ignored by " +
              "other sections.",
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
