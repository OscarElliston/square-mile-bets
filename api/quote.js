export default async function handler(req, res) {
  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?lang=en-US&symbols=${encodeURIComponent(symbols)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) throw new Error('Yahoo returned HTTP ' + r.status);
    const data = await r.json();

    const result = (data.quoteResponse?.result || []).map(q => ({
      symbol:                      q.symbol,
      regularMarketPrice:          q.regularMarketPrice,
      shortName:                   q.shortName || q.longName || q.symbol,
      regularMarketChangePercent:  q.regularMarketChangePercent || 0
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ quoteResponse: { result, error: null } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
