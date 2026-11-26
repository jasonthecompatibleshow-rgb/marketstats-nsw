"""Keeps the shared <head> block (no-flash theme script, favicon, meta/OG tags) identical on every page.
Usage: python etl/heads.py  (idempotent; rewrites the region between <!--head:start--> and <!--head:end-->)."""
import pathlib, re, html
WEB = pathlib.Path(__file__).resolve().parents[1] / "web"
PAGES = {
    "index.html": ("MarketStats NSW · Rent, yield & gearing for every NSW postcode", "Free NSW property analytics: rents by bedroom, gross yields, gearing and nine years of trends for every postcode, from official public data."),
    "map.html": ("Map · MarketStats NSW", "Interactive NSW postcode map of rents, yields, prices, gearing and trends from official NSW Government data."),
    "insights.html": ("Insights · Top movers · MarketStats NSW", "Free NSW rental analytics: biggest rent rises and falls, highest yields, yield changes, cash flow and NSW housing context by postcode."),
    "about.html": ("About · MarketStats NSW", "What MarketStats is, who it's for, the official public data it's built on, and how often it updates."),
    "disclaimer.html": ("Disclaimer · MarketStats NSW", "MarketStats provides general information only. Read about data limitations, median and yield caveats and modelled gearing assumptions."),
    "pricing.html": ("Pricing & plans · MarketStats NSW", "MarketStats is free for every NSW postcode. Investor and Pro plans with watchlists, alerts, exports and white-label reports are coming soon."),
    "privacy.html": ("Privacy policy · MarketStats NSW", "How MarketStats handles account and email information under the Australian Privacy Principles. Draft for legal review."),
    "data.html": ("Data sources & methodology · MarketStats NSW", "Every dataset MarketStats uses, its licence and attribution, and how rents, yields, trends and gearing are calculated."),
}
THEME = "<script>(function(){var t;try{t=localStorage.getItem('ms-theme')}catch(e){}document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')})()</script>"
def block(title, desc):
    t, d = html.escape(title), html.escape(desc)
    return f"""<!--head:start-->
{THEME}
<title>{t}</title>
<meta name="description" content="{d}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0b0f19" media="(prefers-color-scheme: dark)">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="MarketStats"><meta property="og:type" content="website"><meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:image" content="og.png"><meta name="twitter:card" content="summary_large_image">
<!--head:end-->"""
for f, (title, desc) in PAGES.items():
    p = WEB / f
    if not p.exists(): continue
    s = p.read_text()
    if "<!--head:start-->" in s:
        s = re.sub(r"<!--head:start-->.*?<!--head:end-->", lambda m: block(title, desc), s, flags=re.S)
    else:
        s = re.sub(r"<title>.*?</title>\s*", "", s, flags=re.S)
        s = re.sub(r'<meta name="description"[^>]*>\s*', "", s)
        s = re.sub(r'(<meta name="viewport"[^>]*>)', lambda m: m.group(1) + "\n" + block(title, desc), s, count=1)
    p.write_text(s)
    print("head:", f)
