# 🎰 Square Mile Bets

A multiplayer fantasy finance game where players pick a portfolio of stocks and compete to see whose picks perform best over a fixed period.

Live at **[square-mile-bets.vercel.app](https://square-mile-bets.vercel.app)**

---

## How It Works

1. Before the game starts, each player submits their name and picks 3 stocks or funds
2. An admin locks in the starting prices to set the baseline
3. Everyone's portfolio is indexed to **300** at the start (100 per stock)
4. Prices update automatically throughout the game
5. The leaderboard ranks players by average % gain across their 3 picks

---

## Features

- **Real-time leaderboard** — standings update automatically as prices move
- **Standings tab** — portfolio leaderboard + individual player cards showing each stock sorted by performance
- **All Stocks tab** — every pick ranked by % gain, with company name and owning player
- **Dashboard tab** — portfolio value over time (line chart) + a stacked bar chart showing portfolio composition and value breakdown per player
- **Hover tooltips** — mouse over any bar to see a breakdown of that player's stocks and their individual % changes
- **London Stock Exchange support** — `.L` suffix tickers (e.g. `BA.L`, `BP.L`) alongside US stocks
- **Shared state** — all players see the same data in real time via Firebase
- **Admin controls** — password-protected game management including start game, re-lock prices, and reset

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Single-file HTML/CSS/JS |
| Hosting | Vercel |
| Database | Firebase Firestore (real-time sync) |
| Price data (US) | Finnhub API (via Vercel serverless function) |
| Price data (London) | Yahoo Finance v8 (via Vercel serverless function) |

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/OscarElliston/square-mile-bets.git
cd square-mile-bets
```

### 2. Firebase

- Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- Enable **Firestore** in your project
- Copy your Firebase config into `index.html` where the `firebaseConfig` object is defined

### 3. Finnhub API key

- Sign up for a free key at [finnhub.io](https://finnhub.io)
- In Vercel, add an environment variable: `FINNHUB_KEY = your_key_here`

### 4. Deploy to Vercel

- Push to GitHub and connect the repo in [vercel.com](https://vercel.com)
- Vercel will automatically deploy the `api/quote.js` serverless function alongside `index.html`

---

## File Structure

```
/
├── index.html        # Entire frontend — UI, game logic, Firebase sync
├── api/
│   └── quote.js      # Vercel serverless function — price fetching proxy
└── firebase.json     # Firebase config
```

---

## Game Admin

The ⚙ button in the top right opens the admin panel (password protected). From there you can:

- **Start the game** — locks in current prices as the starting baseline
- **Re-lock start prices** — useful if prices need to be reset mid-game
- **Reset everything** — wipes all game data and starts fresh

---

## Supported Tickers

Any ticker available on Yahoo Finance or Finnhub can be used, including:

- **US stocks & ETFs** — S&P 500, NASDAQ, major ETFs
- **London Stock Exchange** — use the `.L` suffix (e.g. `BRBY.L`, `BP.L`, `BA.L`)

Ticker validation uses a built-in static list covering the S&P 500, NASDAQ 100, and FTSE 100 with autocomplete on the join form.
