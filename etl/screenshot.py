"""Headless smoke test + screenshots for every page, light and dark, desktop and mobile.
Fails (exit 1) on any console error or page error, or if the theme isn't applied before first paint.
Usage: python etl/screenshot.py [base_url]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = pathlib.Path(__file__).resolve().parents[1] / "screenshots-docs"; OUT.mkdir(exist_ok=True)
DESK = dict(viewport={"width": 1440, "height": 900})
MOB = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
MAPW, PAGEW = "window.mapReady === true", "window.pageReady === true"
errors = []

def page(b, ctx_opts, theme="light", stored=True):
    ctx = b.new_context(**ctx_opts, color_scheme=theme)
    if stored: ctx.add_init_script(f"localStorage.setItem('ms-theme','{theme}')")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{pg.url}: {e}"))
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{pg.url}: {m.text}"))
    return pg

def shot(pg, url, name, wait=MAPW, full=False, extra=None, delay=3000, theme=None):
    pg.goto(BASE + url, wait_until="commit")
    # no-flash check: theme attribute must exist as soon as the DOM is parsed, before any app script runs
    pg.wait_for_load_state("domcontentloaded")
    t = pg.evaluate("document.documentElement.dataset.theme")
    if theme and t != theme: errors.append(f"{url}: theme at DOMContentLoaded was {t!r}, expected {theme!r}")
    pg.wait_for_function(wait, timeout=90000); pg.wait_for_timeout(delay)
    if extra: extra(pg)
    pg.screenshot(path=str(OUT / name), full_page=full); print("saved", name)

def tab(t):
    def f(pg): pg.click(f"#tabs button[data-t={t}]"); pg.wait_for_timeout(2500)
    return f
def open_sheet(pg): pg.click("#handle"); pg.wait_for_timeout(1200)
def open_menu(pg): pg.click("#menuBtn"); pg.wait_for_timeout(400)

LANDW = MAPW + " && " + PAGEW
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for th in ("light", "dark"):
        d = page(b, DESK, th)
        shot(d, "index.html", f"{th}-01-landing-desktop.png", LANDW, full=True, theme=th)
        shot(d, "map.html?m=yield&d=U&b=t", f"{th}-02-map-yield-desktop.png", theme=th)
        shot(d, "map.html?m=gearing&d=U&b=2&p=2127", f"{th}-03-map-gearing-2127-desktop.png", theme=th, delay=4000)
        shot(d, "map.html?m=rent&d=A&b=t&p=2042&tab=trends", f"{th}-04-panel-trends-2042.png", theme=th, delay=5000)
        shot(d, "map.html?m=cash&d=H&b=4&p=2155&tab=calc", f"{th}-05-panel-calculator-2155.png", theme=th, delay=4000)
        shot(d, "insights.html?d=U&b=t&min=50", f"{th}-06-insights-desktop.png", PAGEW, full=True, delay=1500, theme=th)
        for pg_ in ("about", "disclaimer", "data"):
            shot(d, f"{pg_}.html", f"{th}-07-{pg_}-desktop.png", PAGEW, full=True, delay=800, theme=th)
        m = page(b, MOB, th)
        shot(m, "index.html", f"{th}-11-landing-mobile.png", LANDW, theme=th)
        shot(m, "index.html", f"{th}-12-landing-mobile-menu.png", LANDW, extra=open_menu, theme=th)
        shot(m, "map.html?m=gearing&d=U&b=t", f"{th}-13-map-gearing-mobile.png", theme=th)
        shot(m, "map.html?m=gearing&d=U&b=t&p=2127&tab=calc", f"{th}-14-map-mobile-sheet.png", extra=open_sheet, delay=4000, theme=th)
        shot(m, "map.html?m=rent&d=U&b=2&p=2042&tab=overview", f"{th}-15-map-mobile-sa2.png", extra=lambda pg: (open_sheet(pg), pg.locator("#sa2ctx").scroll_into_view_if_needed(), pg.wait_for_timeout(500)), delay=4000, theme=th)
        shot(m, "insights.html", f"{th}-16-insights-mobile.png", PAGEW, delay=1500, theme=th)
        for pg_ in ("about", "disclaimer", "data"):
            shot(m, f"{pg_}.html", f"{th}-17-{pg_}-mobile.png", PAGEW, delay=600, theme=th)
    # first visit with no saved choice: follows prefers-color-scheme
    for th in ("dark", "light"):
        f = page(b, DESK, th, stored=False)
        shot(f, "about.html", f"first-visit-{th}.png", PAGEW, delay=300, theme=th)
    # toggle persists across pages
    t = page(b, DESK, "light", stored=False)
    t.goto(BASE + "about.html"); t.wait_for_function(PAGEW); t.click("#themeBtn")
    t.goto(BASE + "disclaimer.html"); t.wait_for_function(PAGEW)
    got = t.evaluate("[document.documentElement.dataset.theme, localStorage.getItem('ms-theme')]")
    print("toggle persisted:", got)
    if got != ["dark", "dark"]: errors.append(f"theme toggle did not persist: {got}")
    # social preview image (og:image) from the landing hero
    o = page(b, dict(viewport={"width": 1200, "height": 630}))
    o.goto(BASE + "index.html"); o.wait_for_function(LANDW, timeout=90000); o.wait_for_timeout(2500)
    o.screenshot(path=str(OUT.parent / "web" / "og.png")); print("saved web/og.png")
    # search interaction
    s = page(b, DESK)
    s.goto(BASE + "map.html"); s.wait_for_function(MAPW, timeout=90000)
    s.fill("#q", "kellyv"); s.wait_for_timeout(300); print("search:", s.locator("#results li").all_inner_texts()[:3])
    s.keyboard.press("Enter"); s.wait_for_timeout(2500); print("panel:", s.locator(".p-head h2").inner_text())
    b.close()
print("console errors:", errors or "none")
sys.exit(1 if errors else 0)
