# Square Mile Bets

A multiplayer fantasy finance game for groups of friends. Each player picks three stocks at the start of a season, and the leaderboard tracks everyone's portfolio performance in real time. At the end of the season, final standings are archived to an all-time Medal Table.

Built as a single-page app — no framework, no build step. Deployed on Vercel with Firebase Firestore for shared state and Google Auth for player identity.

Live at **[square-mile-bets.vercel.app](https://square-mile-bets.vercel.app)**

---

## How it works

1. The admin opens the app for the first time and sets a start date and season length
2. Players visit the link and sign in with Google to submit their name and three stock picks
3. When everyone is ready, the admin locks current prices as the baseline and starts the game
4. Prices update automatically every 5 minutes during market hours; a daily snapshot is saved by a cron job each weekday evening
5. The leaderboard, stock rankings, portfolio chart and breakdown are visible to anyone — no login required to view
6. At season end the admin archives results to the Medal Table, then resets for the next round

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS — single `index.html` |
| Database | Firebase Firestore (real-time sync across all browsers) |
| Auth | Firebase Google Sign-In |
| Price data | Yahoo Finance (via Vercel serverless function) |
| Hosting | Vercel |
| Cron | Vercel cron job — daily snapshot at 9:30pm UTC, Mon–Fri |

---

## Project structure

```
index.html          Main app — all UI, game logic and chart rendering
api/
  quote.js          Serverless function — fetches live prices from Yahoo Finance
  search.js         Serverless function — proxies Yahoo Finance ticker autocomplete
  snapshot.js       Serverless function — saves daily price snapshot to Firestore
vercel.json         Cron schedule config
favicon.png         App icon
```

---

## Setup

### 1. Firebase

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).

- Enable **Firestore** (Native mode)
- Enable **Authentication → Google** sign-in
- Add your Vercel deployment domain to **Authentication → Settings → Authorised domains**

Copy your project config (Project Settings → Your apps → Web app) and paste it into `index.html`:

```js
const FIREBASE_CONFIG = {
  apiKey:            "...",
  authDomain:        "...",
  projectId:         "...",
  storageBucket:     "...",
  messagingSenderId: "...",
  appId:             "..."
};
```

### 2. Admin access

Edit the `ADMIN_EMAILS` array in `index.html` to include your Google account email. Only listed addresses can access Settings, start the game, and end seasons.

```js
const ADMIN_EMAILS = ['you@gmail.com'];
```

### 3. Deploy to Vercel

Push the repo to GitHub and import it as a new Vercel project. No build command or output directory is needed — Vercel detects the serverless functions in `/api` automatically.

Add one environment variable in the Vercel dashboard:

| Variable | Value |
|---|---|
| `FIREBASE_API_KEY` | Your Firebase `apiKey` from the config above |

The cron job in `vercel.json` runs daily at 9:30pm UTC and requires a Vercel Hobby plan or above.

---

## Features

**Submission**
- Players sign in with Google and submit their name and three stock picks
- Live ticker search powered by Yahoo Finance autocomplete
- Category keywords (e.g. "electric cars", "AI", "UK stocks") surface themed suggestions instantly
- Duplicate pick detection across all players in real time
- Admin can edit or remove any player's picks before the game starts

**Live game**
- Leaderboard sorted by portfolio return, refreshed every 5 minutes
- Per-player portfolio cards with individual stock performance and daily change %
- All Stocks tab ranking every pick across all players with a visual performance bar
- Dashboard tab with a portfolio value chart (rebased to 100 at start) and a stacked bar breakdown by stock
- Prices sync in real time across all open browsers via Firestore

**Season end**
- Winner banner with confetti fires when the game ends
- Admin archives final standings to the Medal Table from the Settings panel
- Medal Table tracks gold, silver and bronze counts per player across all seasons, sortable by any column
- All previous season results stored and browsable

**Access model**
- Anyone can view the leaderboard without an account
- Google sign-in required to join or submit picks
- Settings panel and Start Game button visible to the admin only

---

## Supported tickers

Any equity or ETF available on Yahoo Finance, including:

- **US stocks and ETFs** — S&P 500, NASDAQ, major ETFs
- **London Stock Exchange** — use the `.L` suffix (e.g. `BP.L`, `HSBA.L`, `AZN.L`)

---

## Demo mode

If no Firebase config is provided the app runs in demo mode with simulated data for 10 players across a full season — useful for testing the UI without any setup.

---

## Firestore data structure

```
squaremile/game          Active game state (players, picks, start prices, price history)
seasons/{id}             Archived season results
players/{uid}            All-time player stats (gold, silver, bronze, avg return)
```

---

## License

MIT
