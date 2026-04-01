/**
 * /api/quote.js
 *
 * Fetches real-time prices for a comma-separated list of symbols
 * using the Yahoo Finance v8 chart endpoint.
 * Works for all tickers on Yahoo Finance: US stocks, UK (.L), ETFs, crypto, etc.
 * No API key required.
 */

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const results = [];

  await Promise.all(symList.map(async sym => {
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: YF_HEADERS }
      );
      if (!r.ok) return;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return;

      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      results.push({
        symbol:                     sym,
        regularMarketPrice:         meta.regularMarketPrice,
        shortName:                  meta.shortName || meta.longName || meta.symbol || sym,
        regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0
      });
    } catch { /* skip */ }
  }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ quoteResponse: { result: results, error: null } });
}
