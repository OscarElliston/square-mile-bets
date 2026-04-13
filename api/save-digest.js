/**
 * /api/save-digest.js
 *
 * Saves a daily digest entry to the dailyDigests Firestore collection.
 * Called by the scheduled Cowork task after generating AI commentary.
 *
 * POST body (JSON):
 *   { date, headline, body, biggestMovers, leaderboard, roasts }
 *
 * Env vars required:
 *   FIREBASE_API_KEY  — Firebase Web API key
 */

const PROJECT_ID = 'square-mile-bets';
const COLLECTION_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/dailyDigests`;

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')         return { stringValue: v };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number')         return { doubleValue: v };
  if (Array.isArray(v))              return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
  if (!FIREBASE_API_KEY) return res.status(500).json({ error: 'FIREBASE_API_KEY not set' });

  try {
    const { date, headline, body, biggestMovers, leaderboard, roasts } = req.body;

    if (!date || !headline) {
      return res.status(400).json({ error: 'date and headline are required' });
    }

    // Write to Firestore using PATCH (creates or overwrites the doc for this date)
    const docUrl = `${COLLECTION_URL}/${date}?key=${FIREBASE_API_KEY}`;
    const payload = {
      fields: {
        date:          toFsValue(date),
        headline:      toFsValue(headline),
        body:          toFsValue(body || ''),
        biggestMovers: toFsValue(biggestMovers || ''),
        leaderboard:   toFsValue(leaderboard || ''),
        roasts:        toFsValue(roasts || ''),
        generatedAt:   toFsValue(new Date().toISOString()),
      }
    };

    const patchRes = await fetch(docUrl, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error('Firestore write failed: HTTP ' + patchRes.status + ' — ' + errText);
    }

    console.log(`[save-digest] Saved digest for ${date}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ success: true, date });

  } catch (err) {
    console.error('[save-digest] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
