export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const token = process.env.FINNHUB_KEY;
  if (!token) return res.status(500).json({ error: 'FINNHUB_KEY not set' });

  const symList = symbols.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const results = await Promise.all(symList.map(async sym => {
      try {
        // Finnhub uses "LSE:BA" format for London-listed stocks (not "BA.L")
        const finnhubSym = sym.endsWith('.L')
          ? 'LSE:' + sym.slice(0, -2)
          : sym;

        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(finnhubSym)}&token=${token}`
        );
        const d = await r.json();
        if (!d.c || d.c === 0) return null; // no data for this symbol
        return {
          symbol: sym, // always return the original symbol (e.g. "BA.L")
          regularMarketPrice: d.c,
          shortName: sym,
          regularMarketChangePercent: d.pc
            ? ((d.c - d.pc) / d.pc) * 100
            : 0
        };
      } catch { return null; }
    }));

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
