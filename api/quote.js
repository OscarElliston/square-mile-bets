export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const token = process.env.FINNHUB_KEY;
  if (!token) return res.status(500).json({ error: 'FINNHUB_KEY not set' });

  const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const ukSyms  = symList.filter(s => s.endsWith('.L'));
  const usSyms  = symList.filter(s => !s.endsWith('.L'));

  const results = [];

  // ── US tickers via Finnhub ─────────────────────────────────
  await Promise.all(usSyms.map(async sym => {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`
      );
      const d = await r.json();
      if (!d.c || d.c === 0) return;
      results.push({
        symbol: sym,
        regularMarketPrice: d.c,
        shortName: sym,
        regularMarketChangePercent: d.pc ? ((d.c - d.pc) / d.pc) * 100 : 0
      });
    } catch { /* skip */ }
  }));

  // ── London tickers via Yahoo Finance v8 chart endpoint ──────
  // The chart endpoint has different auth requirements than v7/quote
  await Promise.all(ukSyms.map(async sym => {
    try {
      const r = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }
      );
      if (!r.ok) return;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return;
      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      results.push({
        symbol: sym,
        regularMarketPrice: meta.regularMarketPrice,
        shortName: meta.shortName || meta.symbol || sym,
        regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0
      });
    } catch { /* skip */ }
  }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ quoteResponse: { result: results, error: null } });
}
