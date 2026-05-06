"""
Render card.html to card.png at 2x pixel density for mobile WhatsApp display.

Uses an 820px viewport — matches the body width in card-template.html. The
card is mobile-first: a wider template makes the image unreadable when
WhatsApp compresses it into a phone-sized chat bubble.

Usage:  python3 render.py <input_html> <output_png>

Requirements:
  - playwright (pip install playwright --break-system-packages)
  - chromium  (python3 -m playwright install chromium)

The script waits for Google Fonts to load before screenshotting. If the
network is slow or blocked, it'll fall back to a system serif which looks
noticeably worse — in which case bundle the fonts locally next time.
"""

import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

async def render(input_html: str, output_png: str) -> None:
    html_path = Path(input_html).resolve()
    if not html_path.exists():
        raise SystemExit(f"input html not found: {html_path}")

    url = f"file://{html_path}"

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": 820, "height": 10},
            device_scale_factor=2,
        )
        page = await context.new_page()
        await page.goto(url, wait_until="networkidle")
        # Extra buffer for webfont FOIT/FOUT.
        await page.wait_for_timeout(1500)
        await page.screenshot(path=output_png, full_page=True, omit_background=False)
        await browser.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 render.py <input_html> <output_png>", file=sys.stderr)
        sys.exit(2)
    asyncio.run(render(sys.argv[1], sys.argv[2]))
