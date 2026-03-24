/**
 * /api/snapshot.js
 *
 * Vercel serverless function — called daily by cron (see vercel.json).
 * Fetches current prices for all tickers in the active game and writes
 * a dated entry to priceHistory in Firestore.
 *
 * Also accepts manual POST for one-off triggers.
 *
 * Env vars required:
 *   FINNHUB_KEY       — Finnhub API token (same as used by /api/quote)
 *   FIREBASE_API_KEY  — Firebase Web API key (same value as in index.html)
 */

const PROJECT_ID   = 'square-mile-bets';
const DOC_URL      = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/game/state`;

// ── Firestore REST helpers ────────────────────────────────────────────────────

/** Recursively parse a Firestore typed-value object into plain JS */
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
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) {
      out[k] = parseValue(val);
    }
    return out;
  }
  return null;
}

/** Recursively serialise a plain JS value into a Firestore typed-value object */
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

// ── Price fetching (mirrors /api/quote logic) ─────────────────────────────────

async function fetchAllPrices(tickers, finnhubKey) {
  const usSyms = tickers.filter(s => !s.endsWith('.L'));
  const ukSyms = tickers.filter(s =>  s.endsWith('.L'));
  const snapshot = {};

  // US tickers via Finnhub
  await Promise.all(usSyms.map(async sym => {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`
      );
      const d = await r.json();
      if (d.c && d.c !== 0) snapshot[sym] = d.c;
    } catch { /* skip */ }
  }));

  // London tickers via Yahoo Finance v8 chart endpoint
  await Promise.all(ukSyms.map(async sym => {
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }
      );
      if (!r.ok) return;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) snapshot[sym] = meta.regularMarketPrice;
    } catch { /* skip */ }
  }));

  return snapshot;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
  const FINNHUB_KEY      = process.env.FINNHUB_KEY;

  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY not set' });
  if (!FINNHUB_KEY)      return res.status(500).json({ error: 'FINNHUB_KEY not set' });

  try {
    // 1. Read game state from Firestore
    const stateRes = await fetch(`${DOC_URL}?key=${FIREBASE_API_KEY}`);
    if (!stateRes.ok) throw new Error('Firestore read failed: HTTP ' + stateRes.status);
    const doc    = await stateRes.json();
    const fields = doc.fields || {};

    // 2. Extract all unique tickers from every player's picks
    const players = parseValue(fields.players);
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error('No players found in game state');
    }
    const allTickers = [...new Set(players.flatMap(p => Array.isArray(p.picks) ? p.picks : []))];
    if (allTickers.length === 0) throw new Error('No tickers found in any player picks');

    // 3. Fetch current prices
    const snapshot = await fetchAllPrices(allTickers, FINNHUB_KEY);
    const fetchedCount = Object.keys(snapshot).length;
    if (fetchedCount === 0) throw new Error('Price fetch returned no data');

    // 4. Build date key — UTC date string (YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);

    // 5. Merge into existing priceHistory
    const existingHistory = parseValue(fields.priceHistory) || {};
    existingHistory[today] = snapshot;

    // 6. Write updated priceHistory back to Firestore (field-mask update,
    //    so only priceHistory is touched — nothing else in the document changes)
    const patchUrl = `${DOC_URL}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=priceHistory`;
    const patchRes = await fetch(patchUrl, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ fields: { priceHistory: toFsValue(existingHistory) } })
    });
    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error('Firestore write failed: HTTP ' + patchRes.status + ' — ' + errText);
    }

    console.log(`[snapshot] ${today}: saved ${fetchedCount}/${allTickers.length} tickers`);
    return res.status(200).json({
      success: true,
      date:    today,
      saved:   fetchedCount,
      total:   allTickers.length,
      tickers: Object.keys(snapshot)
    });

  } catch (err) {
    console.error('[snapshot] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
