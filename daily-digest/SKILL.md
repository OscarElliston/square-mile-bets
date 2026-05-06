---
name: daily-digest
description: Generate the daily Square Mile Bets WhatsApp digest message. Use this skill whenever the user asks to "run the digest", "write today's update", "daily digest", "WhatsApp update", "game update", or anything about sending the Square Mile Bets group a summary. Also use when the user mentions stock game updates, leaderboard summaries, or daily market roundups for the group.
---

# Square Mile Bets — WhatsApp Digest (Mon / Wed / Fri)

This skill generates a short, banterous digest for the Square Mile Bets WhatsApp group plus a matching branded image card. Oscar runs it manually on **Monday**, **Wednesday**, and **Friday** evenings. Each digest covers multiple days:

| Run day   | Covers          | `since` date to use   |
|-----------|-----------------|-----------------------|
| Monday    | Sat + Sun + Mon | Last Friday's date    |
| Wednesday | Tue + Wed       | Monday's date         |
| Friday    | Thu + Fri       | Wednesday's date      |

The digest combines live game data (leaderboard, stock movers) with recent market news.

## HARD RULES (read before anything else)

These exist because they have been violated before and embarrassed Oscar in a WhatsApp group of 24 people. No exceptions.

### Rule 1 — Company names come from the API, never from memory.

The `/api/game-data` response includes a `name` field on every entry in `allStocks` (and every stock in `topStocks` / `bottomStocks`). Use that field **verbatim**.

- If `name` is present → use it as written.
- If `name` is null or missing → display the bare ticker (e.g. `285A.T`). **Never** guess or infer a company name from the ticker letters. Tickers like `SOIL.L`, `285A.T`, `SMMNY` do NOT mean what they look like.
- You may lightly shorten a long legal name for fit ("Kioxia Holdings Corporation" → "Kioxia") but you must not invent or substitute a different company.

### Rule 2 — Market commentary comes from search results, never from memory.

Every factual claim in the lede / market summary (index levels, earnings moves, macro events, named stock moves) must trace back to a search result from THIS session. Don't paraphrase generic market knowledge.

### Rule 3 — Pre-render verification pass.

Before rendering the PNG, do a short pass over the draft and confirm:
- Every company name used appears in the API's `allStocks[].name` for the matching ticker (or was deliberately left as a bare ticker because `name` was null).
- Every player attribution (`X's Y stock`) matches the `player` field on that ticker in `allStocks`.
- Every number (%, £, rank) traces to a specific field in the API response.

If any check fails, fix the draft — do not render yet.

## Step 1: Determine the period

Work out today's day of the week and calculate the correct `since` date:

- **Monday** → `since` = last Friday (3 days ago)
- **Wednesday** → `since` = Monday (2 days ago)
- **Friday** → `since` = Wednesday (2 days ago)

If Oscar runs it on a different day, ask him what period it should cover and calculate accordingly.

## Step 2: Pull Game Data

Fetch the game data API **with the `since` parameter**:

```
https://square-mile-bets.vercel.app/api/game-data?since=YYYY-MM-DD
```

Replace `YYYY-MM-DD` with the `since` date calculated in Step 1.

From the response, extract:
- The full leaderboard (all players, ranks, total values, total % change)
- **`periodPct`** on each player — their portfolio change over the digest period
- **`periodChangePct`** on each stock — the stock's price change over the digest period
- Each player's individual stock picks with ticker, current value, total % change, day % change, and period % change
- **`name`** on each stock in `allStocks` / `topStocks` / `bottomStocks` — this is the authoritative company name (see Hard Rule 1)
- The top stocks and bottom stocks lists
- The fund average
- The `period` object (confirms which snapshot date was actually used)

If `periodChangePct` or `periodPct` fields are missing, the priceHistory snapshot wasn't available for that date — fall back to `dayChangePct` and note this in the digest.

## Step 3: Search for Market News

Do a web search for market news covering the digest period (not just today). Look for:
- Major index movements (S&P 500, FTSE 100, Nasdaq)
- Big earnings reports
- Macro events (interest rates, geopolitics, oil, commodities)
- Any news specifically relevant to stocks in the game

Keep it to 2-3 headline stories max. The news is colour, not the main event. Every claim you use must come from an actual search result in this session (Hard Rule 2).

## Step 4: Write the Text Digest

Write a short WhatsApp message following this structure and tone:

### Format Rules
- Use WhatsApp formatting: `*bold*` (single asterisk) and `_italic_` (single underscore)
- Use emojis liberally throughout — 📈 📉 🏆 🚀 💀 😅 💰 🪙 etc.
- Keep it SHORT — aim for about 15-20 lines max
- Write in a banterous, laddish tone — light roasting is encouraged
- Always attribute stocks to their player: "Finlay's Coinbase" not just "Coinbase"
- Use the `name` field from the API for the company name (Hard Rule 1)

### Multi-day framing
- **Monday**: Frame as a weekend + Monday roundup. "Here's how we kicked off the week…" or "Weekend's over, back to the markets…"
- **Wednesday**: Frame as a midweek check-in. "Midweek update…" or "Hump day check…"
- **Friday**: Frame as a week-closing roundup. "That's a wrap for the week…" or "End of week vibes…"

Use `periodChangePct` (not `dayChangePct`) when talking about movers, since you're covering multiple days. Mention the period clearly, e.g. "over the last 3 days" on Monday, "since Monday" on Wednesday, "since Wednesday" on Friday.

### Structure
1. *Title line* with 📊 emoji and the date range in italic (e.g. "_Fri 11 Apr – Mon 14 Apr_")
2. *Quick market summary* — 2-3 sentences on the big stories from the period (all claims from search results, per Hard Rule 2)
3. 📈 *Period Winners* — 3-4 stocks that moved most over the period (positive), with player names and period % change
4. 📉 *Period Losers* — 3-4 stocks that moved most over the period (negative), with player names and period % change
5. 🏆 *The Leaderboard* — mention the top 2-3, anyone making big moves in the middle, and whoever's at the bottom. Include `periodPct` where interesting. Add banter.
6. *Fund Average* line with 💰

### Player Rotation Rule
Rotate which players get mentioned across different days. Don't just highlight the same people at the top and bottom every time. Dig into the middle of the table — who's climbing? Who's slipping? Who had a big period even if they're mid-table? The goal is that over the course of a week, most of the 24 players get at least one shoutout.

### Tone Guide
- Banterous but not mean — light roasting, not bullying
- Keep it conversational, like a mate in the group chat
- Go easy on war/conflict language (avoid "destroyed", "decimated", "carnage")
- Self-deprecating humour about Oscar's picks is always welcome
- Use phrases like "ripped", "popped", "got battered", "cratered", "quietly climbing"

## Step 5: Save the Text Digest

Save the text digest as a `.txt` file (NOT markdown) so WhatsApp formatting characters (`*` and `_`) are preserved on copy-paste.

Save to the outputs folder: `/sessions/<session>/mnt/v2/digest-YYYY-MM-DD.txt`
(Use whatever the current session's outputs folder actually is.)

## Step 6: Build the Branded Image Card

Alongside the text digest, produce a matching branded image card for WhatsApp. This step uses the two companion files in this skill folder:

- `card-template.html` — Square Mile Bets themed HTML, **mobile-optimised at 820px wide**. Do NOT widen it — the image lands in a WhatsApp group chat on phones, where a wider card becomes unreadable.
- `render.py` — headless-Chromium screenshot script (matches the template's 820px viewport).

### 6a. Fill in the template

Read `card-template.html` from the skill folder. Copy the markup into a new file (e.g. `card.html` in the working directory) and replace the bracketed placeholders with real data:

- `[DATE_RANGE]` — short uppercase label, e.g. `End of Week · 15–17 Apr` or `Midweek · 13–15 Apr`. Keep it compact.
- `[LEDE_HTML]` — 1-2 short sentences of market colour. Wrap 1-2 punchy phrases in `<span class="accent">…</span>` for claret italic emphasis. Keep it under ~25 words.
- **Winners column** — duplicate the `mover-row` block for 4-5 biggest positive `periodChangePct` movers. Company name (from API `name`, per Hard Rule 1) + player name. Positive percentages always have a `+` prefix and `pos` class.
- **Losers column** — same pattern for 4-5 biggest negative `periodChangePct` movers. Use the unicode minus `−` (U+2212, not a hyphen) and `neg` class.
- **Top of the table** — top 3 leaderboard entries with gold/silver/bronze markers. Each player's three picks as company names (from API, Hard Rule 1) joined by ` · ` in `lb-picks`. You may shorten long names to fit ("Palo Alto Networks" → "Palo Alto") but never substitute a different company.
- **Bottom of the table** — bottom 2 leaderboard entries with their rank numbers. Use `.neg` on `lb-pct` when the percentage is negative.
- **Fund average** — total value and percent with appropriate `.pos` / `.neg` class.

Do not change the body width (820px), padding, or any class names — the layout is tuned for mobile WhatsApp display.

### 6b. Pre-render verification (Hard Rule 3)

Before calling the renderer, do a quick pass:
1. List every company name that appears in the draft (lede + winners + losers + top 3 + bottom 2).
2. For each, find the matching ticker in the API response and confirm `name` matches (modulo light shortening).
3. For each player attribution, confirm the `player` field on that ticker matches what you wrote.
4. If any mismatch: fix the draft, do NOT render.

### 6c. Render to PNG

Run the companion render script:

```bash
python3 <skill-folder>/render.py card.html /sessions/<session>/mnt/v2/digest-YYYY-MM-DD.png
```

Prerequisites (install once per fresh sandbox):

```bash
pip install playwright --break-system-packages --quiet
python3 -m playwright install chromium
```

The render produces an 820px-wide, 2x-density portrait PNG suitable for mobile WhatsApp display.

### 6d. Visual sanity-check

Read the produced PNG back to verify:
- Fonts loaded (DM Serif Display for headings, Inter for labels) — if you see a generic serif, Google Fonts was blocked or slow; re-run the render script.
- No clipped text or broken rows.
- Colours match: salmon background `#FFF1E0`, claret accent `#9E2F50`, teal positive `#0D7680`, claret negative.
- Medal markers render as coloured bars (not emoji squares).

If anything looks off, tweak the filled HTML and re-render.

## Step 7: Present Both Files

Use `present_files` to share both the `.txt` and `.png` together. Recommend Oscar send the image first (visual impact) then paste the text underneath (banter + bottom-table detail).
