/**
 * /api/snapshot.js
 *
 * Vercel serverless function — called daily by cron (see vercel.json).
 * Fetches current prices for all tickers in the active game (including
 * FX cross-rate pairs needed to convert to GBP) and writes dated entries
 * to both priceHistory and fxHistory in Firestore.
 *
 * Also accepts manual POST for one-off triggers.
 *
 * Env vars required:
 *   FIREBASE_API_KEY  — Firebase Web API key (same value as in index.html)
 */

const PROJECT_ID = 'square-mile-bets';
const DOC_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/squaremile/game`;

// ── Robust Yahoo Finance helpers ────────────────────────────────────────────

const YF_HOSTS = [
  'query2.finance.yahoo.com',
  'query1.finance.yahoo.com',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchChartRobust(path) {
  const maxRounds = 2;
  for (let round = 0; round < maxRounds; round++) {
    if (round > 0) await sleep(1000);
    for (const host of YF_HOSTS) {
      try {
        const r = await fetch(`https://${host}${path}`, {
          headers: { 'User-Agent': randomUA() },
          signal: AbortSignal.timeout(8000),
        });
        if (r.ok) return await r.json();
        if (r.status === 429) continue;
      } catch { /* next host */ }
    }
  }
  return null;
}

// ── Firestore REST helpers ────────────────────────────────────────────────────

function parseValue(v) {
  if (!v) return null;
  if ('stringValue'  in v) return v.stringValue;
  if ('doubleValue'  in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(parseValue);
  if ('mapValue'     in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = parseValue(val);
    return out;
  }
  return null;
}

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')         return { stringValue: v };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number')         return { doubleValue: v };
  if (Array.isArray(v))              return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

// ── Price fetching (batched to avoid Yahoo rate limits) ──────────────────────

const BATCH_SIZE = 8;
const BATCH_DELAY = 300;

async function fetchPrices(tickers) {
  const snapshot = {};
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY);
    const batch = tickers.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async sym => {
      try {
        const data = await fetchChartRobust(
          `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`
        );
        if (!data) return;
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) snapshot[sym] = meta.regularMarketPrice;
      } catch { /* skip */ }
    }));
  }
  return snapshot;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY not set' });

  try {
    // 1. Read game state from Firestore
    const stateRes = await fetch(`${DOC_URL}?key=${FIREBASE_API_KEY}`);
    if (!stateRes.ok) throw new Error('Firestore read failed: HTTP ' + stateRes.status);
    const doc    = await stateRes.json();
    const fields = doc.fields || {};

    // 2. Extract all unique stock tickers from every player's picks
    //    Always include benchmark indices for the fund-vs-benchmarks chart
    const BENCHMARK_TICKERS = ['^FTSE', '^GSPC'];
    const players = parseValue(fields.players);
    if (!Array.isArray(players) || players.length === 0) throw new Error('No players found');
    const playerTickers    = [...new Set(players.flatMap(p => Array.isArray(p.picks) ? p.picks : []))];
    if (playerTickers.length === 0) throw new Error('No tickers found');
    const allStockTickers  = [...new Set([...playerTickers, ...BENCHMARK_TICKERS])];

    // 3. Determine which FX cross-rate pairs are needed (based on stored currencies)
    const currencies = parseValue(fields.currencies) || {};
    const uniqueCurrencies = [...new Set(Object.values(currencies))].filter(
      c => c && c !== 'GBP' && c !== 'GBp'
    );
    const fxTickers = uniqueCurrencies.map(c => 'GBP' + c + '=X');

    // 4. Weekday check (belt-and-braces — cron is already Mon–Fri)
    const todayDow = new Date().getUTCDay();
    if (todayDow === 0 || todayDow === 6) {
      return res.status(200).json({ skipped: true, reason: 'weekend' });
    }

    // 5. Fetch stock prices and FX rates in parallel
    const [stockPrices, fxPrices] = await Promise.all([
      fetchPrices(allStockTickers),
      fxTickers.length ? fetchPrices(fxTickers) : Promise.resolve({}),
    ]);

    const fetchedCount = Object.keys(stockPrices).length;
    if (fetchedCount === 0) throw new Error('Price fetch returned no data');

    // 6. Merge into existing price history and FX history
    const today = new Date().toISOString().slice(0, 10);

    const existingHistory   = parseValue(fields.priceHistory) || {};
    const existingFXHistory = parseValue(fields.fxHistory)    || {};

    existingHistory[today]   = stockPrices;
    if (Object.keys(fxPrices).length) {
      existingFXHistory[today] = fxPrices;
    }

    // 7. Write both histories back to Firestore in a single PATCH
    const patchUrl = `${DOC_URL}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=priceHistory&updateMask.fieldPaths=fxHistory`;
    const patchRes = await fetch(patchUrl, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        fields: {
          priceHistory: toFsValue(existingHistory),
          fxHistory:    toFsValue(existingFXHistory),
        }
      })
    });
    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error('Firestore write failed: HTTP ' + patchRes.status + ' — ' + errText);
    }

    const fxCount = Object.keys(fxPrices).length;
    console.log(`[snapshot] ${today}: stocks=${fetchedCount}/${allStockTickers.length} (incl. ${BENCHMARK_TICKERS.length} benchmarks), fx=${fxCount}/${fxTickers.length}`);
    return res.status(200).json({
      success: true,
      date: today,
      stocks: { saved: fetchedCount, total: allStockTickers.length },
      fx:     { saved: fxCount,      total: fxTickers.length },
    });

  } catch (err) {
    console.error('[snapshot] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
