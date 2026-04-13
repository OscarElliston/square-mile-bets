/**
 * /api/game-data.js
 *
 * Returns the current game state as parsed JSON.
 * Used by the scheduled Cowork task to generate the daily digest.
 *
 * Env vars required:
 *   FIREBASE_API_KEY  — Firebase Web API key
 */

const PROJECT_ID = 'square-mile-bets';
const DOC_URL    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/squaremile/game`;

function parseValue(v) {
  if (!v) return null;
  if ('stringValue'  in v) return v.stringValue;
  if ('doubleValue'  in v) return v.doubleValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(parseValue);
  if ('mapValue'     in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = parseValue(val);
    return out;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY not set' });

  try {
    const stateRes = await fetch(`${DOC_URL}?key=${FIREBASE_API_KEY}`);
    if (!stateRes.ok) throw new Error('Firestore read failed: HTTP ' + stateRes.status);
    const doc    = await stateRes.json();
    const fields = doc.fields || {};

    // Parse the full game state into plain JS objects
    const parsed = {};
    for (const [k, v] of Object.entries(fields)) {
      parsed[k] = parseValue(v);
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ success: true, data: parsed });

  } catch (err) {
    console.error('[game-data] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
