/*
 * On-chain holdings of the owner's wallet addresses, valued in USD and BTC.
 *
 * An EVM address is the same on every chain, so one registered address is read on Base, Ronin,
 * Polygon and Ethereum at once and whatever lies where is summed. Fungible tokens belong to the
 * WALLET venue of the Investment Tracker (BTC was sent there to buy them); Yakkamon Genesis eggs
 * belong to the YAKKAMON venue and are priced at the best fillable "Hidden" trait offer on Ronin
 * Market — the price a seller gets right now, not an ask.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const EGG = "0x6d1bc5247ca99d917d91ec52dbbb5ef6c2435107";
const GQL = "https://marketplace-graphql.skymavis.com/graphql";

// symbol -> { address, decimals, price: CoinGecko id or "usd" }
export const CHAINS = {
  base: { rpc: "https://mainnet.base.org", native: { symbol: "ETH", price: "ethereum" }, tokens: {
    FLOWER: { address: "0x3e12b9d6a4d12cd9b4a6d613872d0eb32f68b380", decimals: 18, price: "flower-2" },
    USDC:   { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6, price: "usd" },
    cbBTC:  { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", decimals: 8, price: "bitcoin" },
    WETH:   { address: "0x4200000000000000000000000000000000000006", decimals: 18, price: "ethereum" },
  } },
  ronin: { rpc: "https://api.roninchain.com/rpc", native: { symbol: "RON", price: "ronin" }, tokens: {
    WRON:   { address: "0xe514d9deb7966c8be0ca922de8a064264ea6bcd4", decimals: 18, price: "ronin" },
    USDC:   { address: "0x0b7007c13325c48911f73a2dad5fa5dcbf808adc", decimals: 6, price: "usd" },
    FLOWER: { address: "0x3e12b9d6a4d12cd9b4a6d613872d0eb32f68b380", decimals: 18, price: "flower-2" },
  } },
  polygon: { rpc: "https://polygon-bor-rpc.publicnode.com", native: { symbol: "POL", price: "polygon-ecosystem-token" }, tokens: {
    USDC:   { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6, price: "usd" },
    "USDC.e": { address: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", decimals: 6, price: "usd" },
  } },
  ethereum: { rpc: "https://ethereum-rpc.publicnode.com", native: { symbol: "ETH", price: "ethereum" }, tokens: {
    USDC:   { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6, price: "usd" },
  } },
};
const PRICE_IDS = ["bitcoin", "ethereum", "ronin", "polygon-ecosystem-token", "flower-2"];
const DUST_USD = 0.01;

// Public RPCs rate-limit (mainnet.base.org answered 429 on every other call from Vercel), so each
// chain has fallbacks and a call walks them until one answers.
const RPC_FALLBACKS = {
  "https://mainnet.base.org": ["https://base-rpc.publicnode.com", "https://base.llamarpc.com", "https://1rpc.io/base"],
  "https://api.roninchain.com/rpc": ["https://ronin.lgns.net/rpc", "https://ronin.drpc.org"],
  "https://polygon-bor-rpc.publicnode.com": ["https://polygon-rpc.com", "https://1rpc.io/matic"],
  "https://ethereum-rpc.publicnode.com": ["https://eth.llamarpc.com", "https://cloudflare-eth.com"],
};
async function rpc(url, method, params) {
  let last;
  const urls = [url, ...(RPC_FALLBACKS[url] || [])];
  for (const u of urls.concat(urls)) {   // a second pass: a transient "fetch failed" on every endpoint at once happens
    if (last) await new Promise((r) => setTimeout(r, 150));
    try {
      const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json", "user-agent": UA },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (!r.ok) throw new Error(`${u} ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
const pad = (addr) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const balanceOf = (url, token, addr) => rpc(url, "eth_call", [{ to: token, data: "0x70a08231" + pad(addr) }, "latest"]);

/** Raw balances of one address on every chain: [{ chain, symbol, amount, price }]. A chain that fails is skipped. */
export async function readAddress(addr) {
  const out = [];
  await Promise.all(Object.entries(CHAINS).map(async ([chain, c]) => {
    try {
      const [nat, ...toks] = await Promise.all([
        rpc(c.rpc, "eth_getBalance", [addr, "latest"]),
        ...Object.entries(c.tokens).map(([sym, t]) => balanceOf(c.rpc, t.address, addr).then((h) => [sym, t, h])),
        ...(chain === "ronin" ? [balanceOf(c.rpc, EGG, addr).then((h) => ["EGG", null, h])] : []),
      ]);
      out.push({ chain, symbol: c.native.symbol, amount: Number(BigInt(nat)) / 1e18, price: c.native.price });
      for (const [sym, t, h] of toks) {
        if (sym === "EGG") out.push({ chain, symbol: "Genesis Egg", amount: Number(BigInt(h)), price: "egg", kind: "egg" });
        else out.push({ chain, symbol: sym, amount: Number(BigInt(h)) / 10 ** t.decimals, price: t.price });
      }
    } catch (e) {
      out.push({ chain, error: String(e.message || e).slice(0, 80) });
    }
  }));
  return out;
}

export async function fetchPrices() {
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${PRICE_IDS.join(",")}&vs_currencies=usd`,
    { headers: { "user-agent": UA, accept: "application/json" } });
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = await r.json();
  const p = { usd: 1 };
  for (const id of PRICE_IDS) p[id] = j[id] && j[id].usd;
  return p;
}

/**
 * Best fillable "Hidden" trait offer on Ronin Market, in WRON. The offers feed has no collection
 * filter and pages from the newest; the top fillable offers are always fresh (a stale one has had
 * its WRON spent), so the newest `pages`×50 are enough. availableQuantity > 0 = backed by WRON.
 */
export async function bestEggOfferWron(pages = 8) {
  let best = 0, n = 0;
  const now = Date.now() / 1000;
  for (let f = 0; f < pages * 50; f += 50) {
    const q = `{ collectionOffers(from: ${f}, size: 50) { data { tokenAddress availableQuantity itemPrice endTime } } }`;
    const r = await fetch(GQL, { method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ query: q }) });
    if (!r.ok) throw new Error(`ronin gql ${r.status}`);
    const rows = (((await r.json()).data || {}).collectionOffers || {}).data || [];
    if (!rows.length) break;
    for (const o of rows) {
      if (o.tokenAddress.toLowerCase() !== EGG || !(o.availableQuantity > 0) || o.endTime <= now) continue;
      n++;
      best = Math.max(best, Number(BigInt(o.itemPrice)) / 1e18);
    }
  }
  return { wron: best, fillable: n };
}

/**
 * Pure: value raw balances with prices and split them into venues.
 *   wallet   = every fungible token (BTC was sent to the wallet venue to buy them)
 *   yakkamon = Genesis eggs at the best fillable Hidden offer
 * Dust under DUST_USD is dropped from the item lists but nothing is hidden from the totals.
 */
export function valueHoldings(balances, prices, eggOfferWron) {
  const btcUsd = prices.bitcoin || 0;
  const venues = { wallet: { usd: 0, btc: 0, items: [] }, yakkamon: { usd: 0, btc: 0, items: [] } };
  const errors = [];
  for (const b of balances) {
    if (b.error) { errors.push(`${b.chain}: ${b.error}`); continue; }
    if (!(b.amount > 0)) continue;
    const unit = b.kind === "egg" ? (eggOfferWron || 0) * (prices.ronin || 0) : (prices[b.price] || 0);
    const usd = b.amount * unit;
    const v = venues[b.kind === "egg" ? "yakkamon" : "wallet"];
    v.usd += usd;
    if (usd >= DUST_USD || b.kind === "egg") v.items.push({ chain: b.chain, symbol: b.symbol, amount: b.amount, usd, unitUsd: unit });
  }
  for (const v of Object.values(venues)) {
    v.btc = btcUsd > 0 ? v.usd / btcUsd : 0;
    v.items.sort((a, b) => b.usd - a.usd);
  }
  return { venues, errors };
}
