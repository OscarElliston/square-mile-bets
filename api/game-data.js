/**
 * /api/game-data.js
 *
 * Vercel serverless function — returns the full game state as JSON,
 * including calculated portfolio values, leaderboard, and per-stock
 * performance. Used by Cowork to generate daily digests without
 * needing to scrape the frontend.
 *
 * Query params:
 *   ?since=YYYY-MM-DD  — optional; calculates periodChangePct from
 *                         the snapshot on that date (uses priceHistory)
 *
 * Env vars required:
 *   FIREBASE_API_KEY  — Firebase Web API key
 */

const PROJECT_ID = 'square-mile-bets';
const DOC_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/squaremile/game`;

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// Upper bound on how long we'll wait for a single Yahoo Finance request
const YF_TIMEOUT_MS = 5000;

// Fetch wrapper with timeout — aborts the request if Yahoo takes too long,
// so the serverless function doesn't block on a hung upstream.
async function fetchWithTimeout(url, options = {}, timeoutMs = YF_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Firestore REST helpers ──────────────────────────────────────────────────

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

// ── Price fetching via Yahoo Finance v8 ─────────────────────────────────────

async function fetchPrices(tickers) {
  const prices = {};
  await Promise.all(tickers.map(async sym => {
    try {
      const r = await fetchWithTimeout(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: YF_HEADERS }
      );
      if (!r.ok) return;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        prices[sym] = {
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose || meta.previousClose || null,
          currency: meta.currency || null
        };
      }
    } catch { /* skip — request timed out or failed */ }
  }));
  return prices;
}

// ── Find closest available snapshot date ────────────────────────────────────

function findClosestDate(priceHistory, targetDate) {
  // priceHistory is keyed by date strings like "2026-04-10"
  const dates = Object.keys(priceHistory).sort();
  if (!dates.length) return null;

  // If exact date exists, use it
  if (priceHistory[targetDate]) return targetDate;

  // Otherwise find the closest date on or before the target
  let closest = null;
  for (const d of dates) {
    if (d <= targetDate) closest = d;
    else break;
  }
  // If nothing on or before, use the earliest available
  return closest || dates[0];
}

// Build a {currency -> GBP-per-unit} map from a single fxHistory snapshot.
// fxHistory stores pairs like "GBPUSD=X" -> priceInForeign; invert to get GBP-per-foreign-unit.
function fxRatesFromSnapshot(fxSnapshot) {
  const rates = {};
  if (!fxSnapshot) return rates;
  for (const [pair, price] of Object.entries(fxSnapshot)) {
    if (typeof price !== 'number' || price <= 0) continue;
    const m = /^GBP([A-Z]{3})=X$/.exec(pair);
    if (m) rates[m[1]] = 1 / price;
  }
  return rates;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Allow GET only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — allow any origin (public game data)
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Cache on Vercel's edge for 60s, allow 10 min stale-while-revalidate.
  // Game data moves slowly (price changes are smoothed by the frontend's own 5-min refresh loop).
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');

  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY not set' });

  // Optional: period start date for multi-day change calculation
  const sinceParam = req.query.since || null;

  try {
    // 1. Read game state from Firestore
    const stateRes = await fetch(`${DOC_URL}?key=${FIREBASE_API_KEY}`);
    if (!stateRes.ok) throw new Error('Firestore read failed: HTTP ' + stateRes.status);
    const doc    = await stateRes.json();
    const fields = doc.fields || {};

    const players     = parseValue(fields.players)     || [];
    const startPrices = parseValue(fields.startPrices)  || {};
    const startDate   = parseValue(fields.startDate);
    const endDate     = parseValue(fields.endDate);
    const currencies  = parseValue(fields.currencies)   || {};
    const fxHistory   = parseValue(fields.fxHistory)    || {};
    const priceHistory = parseValue(fields.priceHistory) || {};

    if (!players.length) throw new Error('No players found');

    // Resolve the "since" snapshot date — used for period (multi-day) calculations
    let sinceDate = null;
    let sinceSnapshot = null;
    let sinceFxSnapshot = null;
    if (sinceParam && Object.keys(priceHistory).length) {
      sinceDate = findClosestDate(priceHistory, sinceParam);
      sinceSnapshot = sinceDate ? priceHistory[sinceDate] : null;
      // Historical FX for the same date (fall back to closest-date-or-before if missing)
      if (sinceDate && Object.keys(fxHistory).length) {
        const fxDate = fxHistory[sinceDate] ? sinceDate : findClosestDate(fxHistory, sinceDate);
        sinceFxSnapshot = fxDate ? fxHistory[fxDate] : null;
      }
    }

    // 2. Collect all unique tickers
    const allTickers = [...new Set(players.flatMap(p =>
      (p.picks || []).map(pk => typeof pk === 'string' ? pk : pk.ticker)
    ))];

    // 3. Determine FX pairs needed
    const uniqueCurrencies = [...new Set(Object.values(currencies))].filter(
      c => c && c !== 'GBP' && c !== 'GBp'
    );
    const fxTickers = uniqueCurrencies.map(c => 'GBP' + c + '=X');

    // 4. Fetch live prices + FX
    const [livePrices, fxPrices] = await Promise.all([
      fetchPrices(allTickers),
      fxTickers.length ? fetchPrices(fxTickers) : Promise.resolve({}),
    ]);

    // Build FX rate lookup (GBP per 1 unit of foreign currency)
    const fxRates = {};
    for (const c of uniqueCurrencies) {
      const pair = 'GBP' + c + '=X';
      if (fxPrices[pair]?.price) {
        fxRates[c] = 1 / fxPrices[pair].price; // convert: 1 foreign unit = X GBP
      }
    }
    // Historical FX rates at the "since" snapshot date (falls back to current rates if missing)
    const sinceFxRates = fxRatesFromSnapshot(sinceFxSnapshot);

    // 5. Calculate portfolio values and stock performances
    const stockPerformances = [];
    const leaderboard = players.map((p, idx) => {
      const picks = (p.picks || []).map(pk => {
        const ticker = typeof pk === 'string' ? pk : pk.ticker;
        const amount = typeof pk === 'string' ? 100 : (pk.amount || 100);
        const sp     = startPrices[ticker];
        const live   = livePrices[ticker];
        const cp     = live?.price;
        const prevCl = live?.previousClose;
        const cur    = currencies[ticker] || 'USD';

        let currentValue = amount;
        let pctChange    = 0;
        let dayChangePct = 0;
        let periodChangePct = null;

        if (sp && cp) {
          // Handle FX conversion for non-GBP stocks
          let fxStart = 1, fxNow = 1;
          if (cur !== 'GBP' && cur !== 'GBp') {
            fxNow = fxRates[cur] || 1;
            fxStart = fxNow; // app uses same rate for start and current
          }
          // GBp (pence) handling
          const divisor = cur === 'GBp' ? 100 : 1;
          const startGBP   = (sp / divisor) * (cur !== 'GBP' && cur !== 'GBp' ? fxStart : 1);
          const currentGBP = (cp / divisor) * (cur !== 'GBP' && cur !== 'GBp' ? fxNow : 1);

          currentValue = amount * (currentGBP / startGBP);
          pctChange    = ((currentGBP / startGBP) - 1) * 100;
          dayChangePct = prevCl ? ((cp - prevCl) / prevCl) * 100 : 0;

          // Period change: compare current price against the "since" snapshot.
          // Convert BOTH endpoints to GBP — use historical FX for the "since" side
          // when we have it, else fall back to current FX.
          if (sinceSnapshot && sinceSnapshot[ticker]) {
            const sincePrice = sinceSnapshot[ticker];
            let fxAtSince = 1;
            if (cur !== 'GBP' && cur !== 'GBp') {
              fxAtSince = sinceFxRates[cur] || fxRates[cur] || 1;
            }
            const sinceGBP   = (sincePrice / divisor) * (cur !== 'GBP' && cur !== 'GBp' ? fxAtSince : 1);
            const currentGBP2 = (cp / divisor) * (cur !== 'GBP' && cur !== 'GBp' ? fxNow : 1);
            if (sinceGBP > 0) {
              periodChangePct = ((currentGBP2 - sinceGBP) / sinceGBP) * 100;
            }
          }
        }

        const stockEntry = {
          ticker,
          player: p.name,
          amount,
          currentValue: +currentValue.toFixed(2),
          totalChangePct: +pctChange.toFixed(2),
          dayChangePct: +dayChangePct.toFixed(2),
          price: cp || null,
          currency: cur
        };
        if (periodChangePct !== null) {
          stockEntry.periodChangePct = +periodChangePct.toFixed(2);
        }
        stockPerformances.push(stockEntry);

        const pickEntry = {
          ticker,
          amount,
          currentValue: +currentValue.toFixed(2),
          totalChangePct: +pctChange.toFixed(2),
          dayChangePct: +dayChangePct.toFixed(2)
        };
        if (periodChangePct !== null) {
          pickEntry.periodChangePct = +periodChangePct.toFixed(2);
        }
        return pickEntry;
      });

      const totalValue = picks.reduce((s, pk) => s + pk.currentValue, 0);

      // Calculate period portfolio change if we have a since snapshot.
      // Aggregate the per-stock period change (already FX-corrected), weighted by amount.
      let periodPortfolioPct = null;
      if (sinceSnapshot) {
        let weighted = 0;
        let weightTotal = 0;
        for (const pk of picks) {
          if (typeof pk.periodChangePct === 'number') {
            weighted   += pk.periodChangePct * pk.amount;
            weightTotal += pk.amount;
          }
        }
        if (weightTotal > 0) {
          periodPortfolioPct = weighted / weightTotal;
        }
      }

      const entry = {
        rank: 0,
        name: p.name,
        picks,
        totalValue: +totalValue.toFixed(2),
        totalGain: +(totalValue - 300).toFixed(2),
        totalPct: +(((totalValue / 300) - 1) * 100).toFixed(1)
      };
      if (periodPortfolioPct !== null) {
        entry.periodPct = +periodPortfolioPct.toFixed(2);
      }
      return entry;
    });

    // Sort by total value descending and assign ranks
    leaderboard.sort((a, b) => b.totalValue - a.totalValue);
    leaderboard.forEach((p, i) => p.rank = i + 1);

    // Sort stocks by performance
    stockPerformances.sort((a, b) => b.totalChangePct - a.totalChangePct);

    // 6. Summary stats
    const avgValue = leaderboard.reduce((s, p) => s + p.totalValue, 0) / leaderboard.length;
    const today = new Date().toISOString().slice(0, 10);

    const response = {
      success: true,
      fetchedAt: new Date().toISOString(),
      game: {
        startDate,
        endDate,
        playerCount: players.length,
        tickerCount: allTickers.length
      },
      summary: {
        date: today,
        fundAverage: +avgValue.toFixed(2),
        fundAveragePct: +(((avgValue / 300) - 1) * 100).toFixed(2),
        topPlayer: leaderboard[0]?.name,
        bottomPlayer: leaderboard[leaderboard.length - 1]?.name
      },
      leaderboard,
      topStocks: stockPerformances.slice(0, 10),
      bottomStocks: stockPerformances.slice(-10).reverse(),
      allStocks: stockPerformances
    };

    // Include period metadata if since was requested
    if (sinceDate) {
      response.period = {
        since: sinceDate,
        requestedSince: sinceParam,
        today
      };
    }

    return res.status(200).json(response);

  } catch (err) {
    console.error('[game-data] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
