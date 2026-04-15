/**
 * /api/quote.js
 *
 * Fetches real-time prices for a comma-separated list of symbols using the
 * Yahoo Finance v8 spark endpoint. This endpoint accepts ALL symbols in a
 * single HTTP request (unlike the chart endpoint which needs one per ticker),
 * making it far less likely to be rate-limited.
 *
 * Falls back to individual chart requests for any symbols the spark endpoint
 * misses (e.g. if Yahoo has a partial outage).
 *
 * Returns: { quoteResponse: { result: [{ symbol, regularMarketPrice,
 *            shortName, regularMarketChangePercent, currency }] } }
 */

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

// ── Spark endpoint: fetches ALL symbols in one HTTP request ─────────────────

async function fetchSpark(symbols) {
  const joined = symbols.map(s => encodeURIComponent(s)).join(',');
  const path = `/v8/finance/spark?symbols=${joined}&range=1d&interval=1d`;

  for (const host of YF_HOSTS) {
    try {
      const r = await fetch(`https://${host}${path}`, {
        headers: { 'User-Agent': randomUA() },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) return await r.json();
    } catch { /* try next host */ }
  }
  return null;
}

// ── Chart endpoint fallback: one ticker at a time ───────────────────────────

async function fetchChartSingle(sym) {
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  for (const host of YF_HOSTS) {
    try {
      const r = await fetch(`https://${host}${path}`, {
        headers: { 'User-Agent': randomUA() },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return await r.json();
    } catch { /* try next host */ }
  }
  return null;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const results = [];
  const found = new Set();

  // 1. Try spark endpoint first — all symbols in one request
  const sparkData = await fetchSpark(symList);
  if (sparkData) {
    for (const sym of symList) {
      const d = sparkData[sym];
      if (!d || !d.close?.length) continue;
      const price = d.close[d.close.length - 1];
      if (!price) continue;
      const prev = d.chartPreviousClose || price;
      results.push({
        symbol: sym,
        regularMarketPrice: price,
        shortName: sym,
        regularMarketChangePercent: prev ? ((price - prev) / prev) * 100 : 0,
        currency: '',  // spark doesn't return currency — frontend uses stored currencies
      });
      found.add(sym);
    }
  }

  // 2. Fallback: fetch any missing symbols individually via chart endpoint
  const missing = symList.filter(s => !found.has(s));
  if (missing.length > 0 && missing.length <= 20) {
    // Only do individual fallback if a reasonable number are missing
    // (if spark totally failed, all 75+ would be missing — retry spark instead)
    await Promise.all(missing.map(async sym => {
      try {
        const data = await fetchChartSingle(sym);
        if (!data) return;
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) return;
        const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
        results.push({
          symbol: sym,
          regularMarketPrice: meta.regularMarketPrice,
          shortName: meta.shortName || meta.longName || meta.symbol || sym,
          regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0,
          currency: meta.currency || 'USD',
        });
      } catch { /* skip */ }
    }));
  } else if (missing.length > 20) {
    // Spark totally failed — retry once after a delay
    await sleep(1000);
    const retry = await fetchSpark(missing);
    if (retry) {
      for (const sym of missing) {
        const d = retry[sym];
        if (!d || !d.close?.length) continue;
        const price = d.close[d.close.length - 1];
        if (!price) continue;
        const prev = d.chartPreviousClose || price;
        results.push({
          symbol: sym,
          regularMarketPrice: price,
          shortName: sym,
          regularMarketChangePercent: prev ? ((price - prev) / prev) * 100 : 0,
          currency: '',
        });
      }
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ quoteResponse: { result: results, error: null } });
}
