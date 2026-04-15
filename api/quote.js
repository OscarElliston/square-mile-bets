/**
 * /api/quote.js
 *
 * Fetches real-time prices for a comma-separated list of symbols
 * using the Yahoo Finance v8 chart endpoint.
 * Works for all tickers on Yahoo Finance: US stocks, UK (.L), ETFs,
 * FX cross-rates (e.g. GBPUSD=X), crypto, etc.
 * No API key required.
 *
 * Robust fetching: tries multiple Yahoo hostnames, retries on failure,
 * and rotates User-Agent strings to minimise rate-limiting.
 *
 * Returns: { symbol, regularMarketPrice, shortName,
 *            regularMarketChangePercent, currency }
 */

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

/**
 * Fetch a single Yahoo Finance chart URL with retries across multiple hosts.
 * Tries each host once, then retries the full cycle once more after a delay.
 */
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
        // 429 = rate limited — try next host
        if (r.status === 429) continue;
        // Other HTTP error — try next host
      } catch {
        // Timeout or network error — try next host
      }
    }
  }
  return null;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const results = [];

  await Promise.all(symList.map(async sym => {
    try {
      const data = await fetchChartRobust(
        `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`
      );
      if (!data) return;
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return;

      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      results.push({
        symbol:                     sym,
        regularMarketPrice:         meta.regularMarketPrice,
        shortName:                  meta.shortName || meta.longName || meta.symbol || sym,
        regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
        currency:                   meta.currency || 'USD',
      });
    } catch { /* skip */ }
  }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ quoteResponse: { result: results, error: null } });
}
