export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);

  try {
    // Yahoo Finance v8 chart API — still works without auth
    const results = await Promise.all(symList.map(async sym => {
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Accept-Language': 'en-US,en;q=0.9',
            }
          }
        );
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (!meta) return null;
        return {
          symbol: sym,
          regularMarketPrice: meta.regularMarketPrice,
          shortName: meta.longName || meta.shortName || sym,
          regularMarketChangePercent: meta.regularMarketPrice && meta.chartPreviousClose
            ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100
            : 0
        };
      } catch { return null; }
    }));

    // Return in same shape as v7 so the app code doesn't need to change
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      quoteResponse: {
        result: results.filter(Boolean),
        error: null
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
