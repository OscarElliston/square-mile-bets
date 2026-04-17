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

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);

const YF_TIMEOUT_MS = 5000;

// Fetch wrapper with timeout — aborts the request if Yahoo takes too long.
async function fetchWithTimeout(url, options = {}, timeoutMs = YF_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(200).json({ results: [] });

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    const r = await fetchWithTimeout(url, { headers: YF_HEADERS });
    if (!r.ok) return res.status(200).json({ results: [] });

    const data = await r.json();
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
    // Ticker lookup results are stable — cache for a day
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ results });
  } catch {
    res.status(200).json({ results: [] });
  }
}
