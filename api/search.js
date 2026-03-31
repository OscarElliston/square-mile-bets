/**
 * /api/search.js
 *
 * Proxies Yahoo Finance autocomplete search so the browser doesn't
 * hit Yahoo directly (CORS). Returns a cleaned list of equity/ETF results.
 *
 * GET /api/search?q=apple
 * → { results: [{ symbol, name, exchange, type }, ...] }
 */

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || !q.trim()) return res.status(200).json({ results: [] });

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    const r = await fetch(url, { headers: YF_HEADERS });
    if (!r.ok) return res.status(200).json({ results: [] });

    const data = await r.json();
    const results = (data?.quotes || [])
      .filter(item => item.symbol && ALLOWED_TYPES.has(item.quoteType))
      .map(item => ({
        symbol:   item.symbol,
        name:     item.shortname || item.longname || item.symbol,
        exchange: item.exchDisp || item.exchange || '',
        type:     item.quoteType
      }))
      .slice(0, 8);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ results });
  } catch {
    res.status(200).json({ results: [] });
  }
}
