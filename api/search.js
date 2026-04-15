/**
 * /api/search.js
 *
 * Proxies Yahoo Finance autocomplete search so the browser doesn't
 * hit Yahoo directly (CORS). Returns a cleaned list of equity/ETF results.
 *
 * GET /api/search?q=apple
 * → { results: [{ symbol, name, exchange, type, currency }, ...] }
 *
 * The `currency` field indicates what currency prices are quoted in:
 *   USD  — US dollars (most US stocks)
 *   GBp  — British pence (LSE stocks with .L suffix — divide by 100 for GBP)
 *   EUR  — Euros (Euronext, Xetra, etc.)
 *   JPY  — Japanese yen (Tokyo Stock Exchange)
 *   HKD  — Hong Kong dollars (HKEX)
 *   etc.
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

async function fetchSearchRobust(path) {
  const maxRounds = 2;
  for (let round = 0; round < maxRounds; round++) {
    if (round > 0) await sleep(500);
    for (const host of YF_HOSTS) {
      try {
        const r = await fetch(`https://${host}${path}`, {
          headers: { 'User-Agent': randomUA() },
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) return await r.json();
        if (r.status === 429) continue;
      } catch { /* next host */ }
    }
  }
  return null;
}

// ── Handler ─────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(200).json({ results: [] });

  try {
    const data = await fetchSearchRobust(
      `/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`
    );
    if (!data) return res.status(200).json({ results: [] });

    const results = (data?.quotes || [])
      .filter(item => item.symbol && ALLOWED_TYPES.has(item.quoteType))
      .map(item => ({
        symbol:   item.symbol,
        name:     item.shortname || item.longname || item.symbol,
        exchange: item.exchDisp || item.exchange || '',
        type:     item.quoteType,
        currency: item.currency || '',
      }))
      .slice(0, 8);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ results });
  } catch {
    res.status(200).json({ results: [] });
  }
}
