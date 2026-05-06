# daily-digest skill

Source for the Claude skill that generates the Square Mile Bets WhatsApp digest (Mon / Wed / Fri). Lives in source form here so each file is plain-text reviewable and diffable in GitHub. The packaged `.skill` (a zip of these three files) lives one level up at [`../daily-digest.skill`](../daily-digest.skill) and is what actually gets uploaded into Claude.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | The skill instructions Claude reads. Hard rules (name-from-API, search-not-memory, pre-render verification) live at the top. |
| `card-template.html` | The 820px-wide branded card template that gets filled in and rendered to PNG. **Never widen beyond 820px** — WhatsApp compresses to phone width. |
| `render.py` | Playwright + headless Chromium script that turns the populated HTML into a 2×-density PNG. |

## Editing the skill

1. Edit any of the three files in this folder.
2. Repack into a `.skill` zip from inside this folder so the files sit at the zip root (Claude expects no top-level directory):
   ```
   cd daily-digest
   zip -r ../daily-digest.skill SKILL.md card-template.html render.py
   ```
3. Re-upload `daily-digest.skill` in Claude via "Save skill". The new version replaces the old one.

To verify the zip layout before uploading:
```
unzip -l ../daily-digest.skill
```
The three files should be at the root, not nested in a `daily-digest/` folder.

## Schedule

Oscar runs the skill manually on Mon / Wed / Fri evenings. The `since` date the skill should pass to `/api/game-data` depends on the day:

| Run day   | Covers          | `since` date          |
|-----------|-----------------|-----------------------|
| Monday    | Sat + Sun + Mon | Last Friday's date    |
| Wednesday | Tue + Wed       | Monday's date         |
| Friday    | Thu + Fri       | Wednesday's date      |

## Hard rules (don't relax these without a strong reason)

1. **Company names come from the API `name` field, never from memory.** Tickers like `SOIL.L`, `285A.T`, `SMMNY` do not mean what their letters look like. Substituting a guessed name is what caused the 2026-04-20 Toyota / Sunrise Resources incident.
2. **Market commentary comes from web search, never from memory.** Prices and news move daily — model recall is stale.
3. **Pre-render verification pass is required.** Every name, player, and number in the draft must trace back to the API response or a search result before the PNG is generated.

These rules are duplicated at the top of `SKILL.md` because that's where Claude reads them.
