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
 *   ?history=true      — optional; adds a top-level `history` object
 *                         with daily portfolio totals per player,
 *                         matching the logic in app.js
 *                         (getPlayerPortfolioHistory). Used by the
 *                         digest card renderer for sparklines.
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

// ── Portfolio history builder ───────────────────────────────────────────────
// Matches app.js `getPlayerPortfolioHistory` so sparklines in the card
// are identical to what players see on the live site.
//
// Algorithm:
//   1. Build an "all snapshots" map = priceHistory ∪ today's live prices ∪ sentinel "0000-00-00".
//   2. Build an "all FX snapshots" map similarly; "0000-00-00" uses today's FX (bootstrap).
//   3. Sort dates; keep the sentinel; drop Saturdays and Sundays.
//   4. For each player and each date, sum shares × priceInGBP across their picks.
//      Missing shares or missing price → fall back to the allocation amount (default 100).
//   5. The sentinel date always returns the baseline (sum of allocations), which is
//      conventionally £300 but may differ per player if allocations are non-default.
function buildPortfolioHistory(players, priceHistory, fxHistory, startPrices, currencies, livePrices, fxPrices, startDate) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const SENTINEL = '0000-00-00';

  // 1. Merge in today's live prices under today's date.
  const allSnapshots = { ...priceHistory };
  if (Object.keys(livePrices || {}).length) {
    allSnapshots[todayKey] = { ...(allSnapshots[todayKey] || {}) };
    for (const [sym, info] of Object.entries(livePrices)) {
      if (info?.price != null) allSnapshots[todayKey][sym] = info.price;
    }
  }
  // Sentinel uses startPrices (actual data isn't used by the value calc — it short-circuits
  // to the allocation baseline — but we still set it so the sentinel date appears in the sort).
  allSnapshots[SENTINEL] = { ...startPrices };

  // 2. Merge in today's live FX into the FX history, and bootstrap the sentinel.
  const allFXSnaps = { ...fxHistory };
  const liveFxSnap = {};
  for (const [pair, info] of Object.entries(fxPrices || {})) {
    if (info?.price != null) liveFxSnap[pair] = info.price;
  }
  if (Object.keys(liveFxSnap).length) {
    allFXSnaps[todayKey] = { ...(allFXSnaps[todayKey] || {}), ...liveFxSnap };
    // Site uses the current FX rates as the starting FX bootstrap (see app.js L2596-2600).
    if (!allFXSnaps[SENTINEL]) allFXSnaps[SENTINEL] = { ...liveFxSnap };
  }

  // 3. Sort dates; exclude weekends (Sat/Sun) except for the sentinel.
  const sortedDates = Object.keys(allSnapshots).sort().filter(d => {
    if (d === SENTINEL) return true;
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    return dow !== 0 && dow !== 6;
  });

  // 4. Compute each player's daily portfolio value.
  const playerSeries = {};
  for (const p of players) {
    const picks    = p.picks || [];
    const alloc    = p.allocations || {};
    const shares   = p.startShares || {};

    const baseline = picks.reduce((s, pk, idx) => {
      const a = typeof pk === 'string'
        ? (alloc[idx] ?? 100)
        : (pk.amount ?? alloc[idx] ?? 100);
      return s + a;
    }, 0);

    playerSeries[p.name] = sortedDates.map(date => {
      if (date === SENTINEL) return +baseline.toFixed(2);
      const snap   = allSnapshots[date] || {};
      const fxSnap = allFXSnaps[date] || allFXSnaps[SENTINEL] || {};
      const total = picks.reduce((sum, pk, idx) => {
        const ticker = typeof pk === 'string' ? pk : pk.ticker;
        const amount = typeof pk === 'string'
          ? (alloc[idx] ?? 100)
          : (pk.amount ?? alloc[idx] ?? 100);
        const sh  = shares[ticker];
        const raw = snap[ticker];
        if (!sh || !raw) return sum + amount; // fall back to allocation if price missing
        const cur = currencies[ticker] || 'USD';
        let priceGBP;
        if (cur === 'GBP')      priceGBP = raw;
        else if (cur === 'GBp') priceGBP = raw / 100;
        else {
          const fxKey  = 'GBP' + cur + '=X';
          const fxRate = fxSnap[fxKey];
          priceGBP = fxRate ? raw / fxRate : null;
        }
        return sum + (priceGBP != null ? sh * priceGBP : amount);
      }, 0);
      return +total.toFixed(2);
    });
  }

  // Map the sentinel to the actual game start date for display (fall back to the string).
  const displayDates = sortedDates.map(d => d === SENTINEL ? (startDate || d) : d);

  return {
    baseline: 300,
    dates: displayDates,
    players: playerSeries
  };
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
  // Optional: include per-player daily portfolio history for sparklines
  const includeHistory = req.query.history === 'true' || req.query.history === '1';

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

    // Include portfolio history for sparklines if history=true was requested.
    // This replicates app.js getPlayerPortfolioHistory so the digest card
    // draws identical lines to what players see on the live site.
    if (includeHistory) {
      response.history = buildPortfolioHistory(
        players, priceHistory, fxHistory, startPrices, currencies,
        livePrices, fxPrices, startDate
      );
    }

    return res.status(200).json(response);

  } catch (err) {
    console.error('[game-data] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
