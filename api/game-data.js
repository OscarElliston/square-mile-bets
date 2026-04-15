/**
 * /api/game-data.js
 *
 * Vercel serverless function — returns the full game state as JSON,
 * including calculated portfolio values, leaderboard, and per-stock
 * performance. Used by Cowork to generate daily digests without
 * needing to scrape the frontend.
 *
 * Env vars required:
 *   FIREBASE_API_KEY  — Firebase Web API key
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

// ── Price fetching (uses robust multi-host fetcher) ─────────────────────────

async function fetchPrices(tickers) {
  const prices = {};
  await Promise.all(tickers.map(async sym => {
    try {
      const data = await fetchChartRobust(
        `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`
      );
      if (!data) return;
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice) {
        prices[sym] = {
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose || meta.previousClose || null,
          currency: meta.currency || null
        };
      }
    } catch { /* skip */ }
  }));
  return prices;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Allow GET only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — allow any origin (public game data)
  res.setHeader('Access-Control-Allow-Origin', '*');

  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY not set' });

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

    if (!players.length) throw new Error('No players found');

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

        if (sp && cp) {
          // Handle FX conversion for non-GBP stocks
          let fxStart = 1, fxNow = 1;
          if (cur !== 'GBP' && cur !== 'GBp') {
            // Use latest FX rate for both (simplified — matches app logic)
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
        }

        stockPerformances.push({
          ticker,
          player: p.name,
          amount,
          currentValue: +currentValue.toFixed(2),
          totalChangePct: +pctChange.toFixed(2),
          dayChangePct: +dayChangePct.toFixed(2),
          price: cp || null,
          currency: cur
        });

        return {
          ticker,
          amount,
          currentValue: +currentValue.toFixed(2),
          totalChangePct: +pctChange.toFixed(2),
          dayChangePct: +dayChangePct.toFixed(2)
        };
      });

      const totalValue = picks.reduce((s, pk) => s + pk.currentValue, 0);
      return {
        rank: 0,
        name: p.name,
        picks,
        totalValue: +totalValue.toFixed(2),
        totalGain: +(totalValue - 300).toFixed(2),
        totalPct: +(((totalValue / 300) - 1) * 100).toFixed(1)
      };
    });

    // Sort by total value descending and assign ranks
    leaderboard.sort((a, b) => b.totalValue - a.totalValue);
    leaderboard.forEach((p, i) => p.rank = i + 1);

    // Sort stocks by performance
    stockPerformances.sort((a, b) => b.totalChangePct - a.totalChangePct);

    // 6. Summary stats
    const avgValue = leaderboard.reduce((s, p) => s + p.totalValue, 0) / leaderboard.length;
    const today = new Date().toISOString().slice(0, 10);

    return res.status(200).json({
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
    });

  } catch (err) {
    console.error('[game-data] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
