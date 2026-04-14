# Square Mile Bets

A multiplayer stock-picking game where players each invest a virtual £300 across three stocks and compete to build the best-performing portfolio. Built as a lightweight single-page app deployed on Vercel with Firebase Firestore for persistence.

Live at **[square-mile-bets.vercel.app](https://square-mile-bets.vercel.app)**

---

## How It Works

1. The admin sets a start date and game length
2. Players visit the link and sign in with Google to submit their name, three stock picks, and how they want to allocate their £300 pot (min £50, max £150 per pick; must total exactly £300)
3. When everyone is ready, the admin locks current prices as the baseline and starts the game
4. Prices update automatically every 5 minutes during market hours; a daily closing snapshot is saved by a cron job each weekday at 9:30pm UTC
5. The leaderboard, stock rankings, charts and player cards are visible to anyone — no login required to view
6. At season end the player with the highest portfolio value wins

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JS — three files, no framework, no build step |
| Database | Firebase Firestore (real-time sync across all browsers) |
| Auth | Firebase Google Sign-In |
| Price data | Yahoo Finance v8 API |
| Hosting | Vercel |
| Cron | Vercel cron job — daily snapshot at 9:30pm UTC, Mon–Fri |

---

## Project Structure

```
index.html          HTML shell — structure, modals, layout
styles.css          All styling (dark theme default + FT light theme)
app.js              Application logic — data loading, charts, UI rendering
api/
  quote.js          Serverless function — fetches live prices from Yahoo Finance
  search.js         Serverless function — proxies Yahoo Finance ticker autocomplete
  snapshot.js       Serverless cron function — saves daily closing prices + FX rates to Firestore
  game-data.js      Serverless function — returns full game state + calculated values as JSON
vercel.json         Vercel config (rewrites, cron schedule)
favicon.png         App icon
```

---

## Features

**Live Leaderboard**
- Ranked by current portfolio value (£), refreshed every 5 minutes
- Position change arrows (▲▼) showing daily rank movement vs previous close
- Confetti when you're in first place

**Player Cards**
- Individual stock breakdowns with day change and total performance
- Current value and gain/loss per position

**Charts**
- Portfolio Value Over Time (£) — tracks each player's portfolio with a fixed £300 baseline
- Fund vs Benchmarks — compares the group average against FTSE 100 and S&P 500, indexed to 100

**Stock Leaderboard**
- Every pick ranked by total % return with visual performance bars

**Multi-Currency Support**
- Any Yahoo Finance global stock, automatically converted to GBP via live cross-rate pairs
- UK stocks priced in GBX (pence) automatically divided by 100
- FX rates locked at game start for accurate baseline calculations

**Themes**
- Dark theme (default) and FT-style light theme toggle

**Admin Panel**
- Manage players, edit picks and allocations
- Lock start prices and configure game dates
- Google sign-in with admin email whitelist

**Access Model**
- Anyone can view the leaderboard without an account
- Google sign-in required to join or submit picks
- Settings panel visible to admin only

---

## Data Flow

1. **Admin locks start prices** — saves `startPrices`, `startShares`, `startFX`, and `currencies` to Firestore
2. **Daily cron** (`/api/snapshot`) runs at 9:30pm UTC on weekdays, fetching closing prices from Yahoo Finance and writing them to `priceHistory` and `fxHistory` in Firestore
3. **Frontend** loads game state from Firestore on page load, fetches live intraday prices from Yahoo Finance, and overwrites today's snapshot so prices stay current throughout the day
4. **Game data API** (`/api/game-data`) provides a JSON endpoint with calculated portfolio values, leaderboard, and per-stock performance — useful for generating daily digest summaries externally

---

## Firestore Structure

All game state lives in a single document at `squaremile/game`:

- `players` — array of player objects (name, picks, allocations, startShares)
- `startPrices` — locked prices at game start
- `startFX` — locked FX rates at game start
- `currencies` — ticker-to-currency mapping
- `priceHistory` — `{ "2025-07-01": { "AAPL": 195.2, ... }, ... }`
- `fxHistory` — `{ "2025-07-01": { "GBPUSD=X": 1.27, ... }, ... }`
- `startDate` / `endDate` — game period
- `gameName` — display name

---

## Setup

### 1. Firebase

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com):

- Enable **Firestore** (Native mode)
- Enable **Authentication → Google** sign-in
- Add your Vercel deployment domain to **Authentication → Settings → Authorised domains**

### 2. Admin Access

Edit the `ADMIN_EMAILS` array in `app.js` to include your Google account email:

```js
const ADMIN_EMAILS = ['you@gmail.com'];
```

### 3. Deploy to Vercel

Push the repo to GitHub and import it as a new Vercel project. No build command or output directory needed — Vercel serves the static files and detects the serverless functions in `/api` automatically.

Add one environment variable in the Vercel dashboard:

| Variable | Value |
|---|---|
| `FIREBASE_API_KEY` | Your Firebase `apiKey` |

The cron job in `vercel.json` requires a Vercel Hobby plan or above.

---

## Supported Tickers

Any equity or ETF available on Yahoo Finance — globally. The currency is detected automatically and all portfolio values are converted to GBP in real time.

- **US stocks and ETFs** — priced in USD, converted at live GBPUSD rate
- **London Stock Exchange** — `.L` suffix (e.g. `BP.L`, `HSBA.L`); prices in GBX, auto-divided by 100
- **European stocks** — Euronext, Xetra, etc.; priced in EUR, converted via GBPEUR
- **Any other exchange** Yahoo Finance covers — the app fetches the relevant `GBP{currency}=X` pair on demand

---

## License

MIT
